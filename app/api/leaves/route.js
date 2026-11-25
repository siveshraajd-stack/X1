import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { LEAVE_TYPE_KEYS, MANAGER_ROLES, WAITING_LEAVE_STATUSES, MAX_LEAVE_RANGE_DAYS, MONTHLY_PAID_LEAVE_LIMIT, isNonLeaveType, leaveTypeLabel, requestWord } from '@/lib/constants';
import { dayKey, dayStart, normalizeDayKey } from '@/lib/dates';
import {
    countWorkingDays,
    decideLeave,
    decisionStageFor,
    findOverlappingLeave,
    generateActionToken,
    getLeaveBalance,
    getMonthlyPaidUsage,
    getPendingLeaveDays,
    planLeaveSegments,
    currentApproverIds,
    sendLeaveRequestEmail,
} from '@/lib/leave';
import { sendMail } from '@/lib/mailer';

const createSchema = z.object({
    type: z.enum(LEAVE_TYPE_KEYS, { errorMap: () => ({ message: 'Please select a valid time off category' }) }),
    startDate: z.string().min(1, 'From date is required'),
    endDate: z.string().optional().default(''), // not needed for On Duty (one day); checked below for the rest
    // Reason is compulsory for every category except On Duty (checked below)
    reason: z.string().trim().max(500, 'Reason must be 500 characters or fewer').optional().default(''),
    // Compensate leave: the date the employee worked extra
    compensateForDate: z.string().optional().nullable(),
    // On Duty: site and project (optional)
    siteLocation: z.string().trim().max(120, 'Site location must be 120 characters or fewer').optional().nullable(),
    projectName: z.string().trim().max(120, 'Project name must be 120 characters or fewer').optional().nullable(),
});

const decisionSchema = z.object({
    id: z.string().min(1),
    status: z.enum(['APPROVED', 'REJECTED']),
    adminComment: z.string().trim().max(300).optional(),
}).refine((d) => d.status !== 'REJECTED' || Boolean(d.adminComment), {
    message: 'A reason is required to deny a request',
    path: ['adminComment'],
});

const leaveInclude = {
    user: { select: { id: true, name: true, employeeId: true, email: true } },
    manager: { select: { id: true, name: true, email: true } },
    upperManager: { select: { id: true, name: true, email: true } },
};

// GET /api/leaves
//   (employee/manager) own requests + yearly balance
//   ?scope=team   requests assigned to me for approval (manager/admin)
//   (admin / HR) default: requests that need HR (manager already approved), final results, and
//   anything HR itself has to decide as the team lead / manager. Requests still waiting for a
//   team lead or manager, and requests they rejected, never reach HR.
export async function GET(request) {
    try {
        const user = await requireUser();
        const { searchParams } = new URL(request.url);
        const scope = searchParams.get('scope');
        const isAdmin = user.role === 'ADMIN';
        const canApprove = MANAGER_ROLES.includes(user.role);

        let where;
        if (scope === 'team') {
            if (!canApprove) throw new AppError('Forbidden', 403);
            // Admin also sees requests whose manager account no longer exists
            // Team lead sees what is assigned to them; the manager sees what a team lead passed up.
            where = isAdmin
                ? {
                      OR: [
                          { managerId: user.id },
                          { upperManagerId: user.id },
                          { managerId: null, user: { companyId: user.companyId } },
                          { status: 'TEAM_LEAD_APPROVED', upperManagerId: null, user: { companyId: user.companyId } },
                      ],
                      userId: { not: user.id },
                  }
                : { OR: [{ managerId: user.id }, { upperManagerId: user.id }], userId: { not: user.id } };
        } else if (isAdmin) {
            where = {
                user: { companyId: user.companyId },
                OR: [
                    { status: 'MANAGER_APPROVED' },
                    { status: 'APPROVED' },
                    { status: 'REJECTED', rejectedBy: 'HR' },
                    { status: 'REJECTED', rejectedBy: null }, // rejected before the two-step flow existed
                    { status: 'PENDING', managerId: user.id },
                    { status: 'PENDING', managerId: null },
                    { status: 'TEAM_LEAD_APPROVED', upperManagerId: user.id },
                    { status: 'TEAM_LEAD_APPROVED', upperManagerId: null },
                ],
            };
            const userId = searchParams.get('userId');
            if (userId) where.userId = userId;
        } else {
            where = { userId: user.id };
        }

        const leaves = await prisma.leaveRequest.findMany({
            where,
            include: leaveInclude,
            orderBy: { createdAt: 'desc' },
        });

        const withFlags = leaves.map((l) => ({
            ...l,
            // Team lead decides step 1, manager step 2, HR step 3
            canDecide: decisionStageFor(l, user) !== null,
            decisionStage: decisionStageFor(l, user),
        }));

        const balanceYear = Number(dayKey().slice(0, 4));
        const balance = await getLeaveBalance(user.id, balanceYear);
        const pending = {
            sick: await getPendingLeaveDays(user.id, balanceYear, 'SICK'),
            casual: await getPendingLeaveDays(user.id, balanceYear, 'CASUAL'),
        };
        // Names of the HR team, so "waiting for HR" can show who that is
        const hrRows = user.companyId
            ? await prisma.user.findMany({ where: { companyId: user.companyId, role: 'ADMIN' }, select: { name: true }, orderBy: { name: 'asc' } })
            : [];
        // My reporting manager (shown read-only on the leave form; the server always uses the stored link)
        const reportingManager = user.managerId
            ? await prisma.user.findUnique({ where: { id: user.managerId }, select: { id: true, name: true, role: true } })
            : null;
        // Paid leave (Sick + Casual) used this month: 2 a month, anything more is LOP
        const thisMonth = dayKey().slice(0, 7);
        const monthlyUsed = (await getMonthlyPaidUsage(user.id, user.companyId, [thisMonth]))[thisMonth] || 0;
        const monthly = { month: thisMonth, limit: MONTHLY_PAID_LEAVE_LIMIT, used: monthlyUsed, remaining: Math.max(0, MONTHLY_PAID_LEAVE_LIMIT - monthlyUsed) };
        return NextResponse.json({ leaves: withFlags, balance: { ...balance, pending, monthly }, hrNames: hrRows.map((h) => h.name), reportingManager });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch leave requests');
        return NextResponse.json(body, { status });
    }
}

// Tell every admin that an employee has no manager, so they can fix it.
async function notifyAdminsNoManager(employee) {
    const admins = await prisma.user.findMany({
        where: { companyId: employee.companyId, role: 'ADMIN' },
        select: { id: true, name: true, email: true },
    });
    const message = `${employee.name} tried to request leave but has no manager assigned. Please assign a manager in their profile.`;
    await prisma.notification.createMany({
        data: admins.map((a) => ({
            userId: a.id,
            type: 'LEAVE_UPDATE',
            title: 'Leave request blocked: no manager assigned',
            message,
            priority: 'HIGH',
        })),
    });
    await Promise.all(
        admins.map((a) =>
            sendMail({
                to: a.email,
                subject: `Action needed: ${employee.name} has no manager assigned`,
                text: message,
                html: `<p>${message.replace(/</g, '&lt;')}</p>`,
                fromName: 'Keystone',
            })
        )
    );
}

// POST create a leave request - routed first to the employee's team lead (then manager, then HR)
export async function POST(request) {
    try {
        const user = await requireUser();
        if (user.role === 'ADMIN') throw new AppError('Admin accounts do not submit leave requests', 403);

        const input = createSchema.parse(await request.json());
        // LOP cannot be requested directly: extra days beyond the monthly paid limit become LOP automatically
        if (input.type === 'LOP') throw new AppError('Please choose Sick, Casual or another leave type. Extra days beyond the monthly limit are marked LOP automatically.', 400);
        const startKey = normalizeDayKey(input.startDate);
        // On Duty is always a single day: the To date is ignored and set to the From date
        const endKey = input.type === 'OD' ? startKey : normalizeDayKey(input.endDate);
        if (input.type !== 'OD' && !input.endDate) throw new AppError('To date is required', 400);
        if (!startKey || !endKey) throw new AppError('Invalid date. Use YYYY-MM-DD', 400);
        if (endKey < startKey) throw new AppError('To date cannot be before From date', 400);
        // A leave request is valid only for today or a future date, never for a day that is already over
        if (startKey < dayKey()) {
            throw new AppError('Leave can only be requested for today or a future date. Past dates are not allowed.', 400);
        }

        if (input.type !== 'OD' && !input.reason) throw new AppError('Reason is required', 400);

        // Compensate: say which day was worked, to take these days off
        let compensateForDate = null;
        if (input.type === 'COMPENSATE') {
            compensateForDate = normalizeDayKey(input.compensateForDate || '');
            if (!compensateForDate) throw new AppError('Please select the date you worked, to compensate for this leave', 400);
            if (compensateForDate > dayKey()) throw new AppError('The compensated work date cannot be in the future', 400);
            if (compensateForDate >= startKey) throw new AppError('The worked date must be before the leave start date', 400);
        }

        const startDate = dayStart(startKey);
        const endDate = dayStart(endKey);
        const spanDays = Math.round((endDate - startDate) / 86400000) + 1;
        if (spanDays > MAX_LEAVE_RANGE_DAYS) throw new AppError(`A request can cover at most ${MAX_LEAVE_RANGE_DAYS} days`, 400);

        // a) find the team lead (first approver) from the stored manager link
        const manager = user.managerId
            ? await prisma.user.findFirst({
                  where: { id: user.managerId, companyId: user.companyId, role: { in: MANAGER_ROLES } },
                  select: { id: true, name: true, email: true, role: true, managerId: true },
              })
            : null;
        if (!manager) {
            await notifyAdminsNoManager(user);
            throw new AppError(
                'No manager is assigned to you, so this request cannot be sent. Your admin has been notified.',
                400,
                { code: 'NO_MANAGER' }
            );
        }

        // Days are working days only (weekends and company holidays are not leave)
        const days = await countWorkingDays(user.companyId, startKey, endKey);
        if (days === 0) throw new AppError('The selected dates contain no working days (only weekends or holidays)', 400);

        const overlap = await findOverlappingLeave(user.id, startDate, endDate);
        if (overlap) throw new AppError('You already have a pending or approved leave overlapping these dates', 409);

        // Paid leave is 2 days a month (Sick + Casual together). Days beyond that - or beyond the yearly
        // quota of the category - are not refused: they become separate LOP (Loss of Pay) requests.
        const leaveYear = Number(startKey.slice(0, 4));
        if (Number(endKey.slice(0, 4)) !== leaveYear && ['SICK', 'CASUAL'].includes(input.type)) {
            throw new AppError('Please submit separate requests for each calendar year', 400);
        }
        let yearlyAvailable = Infinity;
        if (['SICK', 'CASUAL'].includes(input.type)) {
            const balanceNow = await getLeaveBalance(user.id, leaveYear);
            const reserved = await getPendingLeaveDays(user.id, leaveYear, input.type);
            yearlyAvailable = Math.max(0, (balanceNow[input.type.toLowerCase()]?.remaining ?? 0) - reserved);
        }
        const segments = await planLeaveSegments({
            userId: user.id,
            companyId: user.companyId,
            type: input.type,
            startKey,
            endKey,
            yearlyAvailable,
        });
        if (!segments.length) throw new AppError('The selected dates contain no working days (only weekends or holidays)', 400);

        // The manager above the team lead (second approver). None when the team lead reports to HR.
        let upperManager = null;
        if (['TEAM_LEAD', 'MANAGER'].includes(manager.role) && manager.managerId) {
            upperManager = await prisma.user.findFirst({
                where: { id: manager.managerId, companyId: user.companyId, role: 'MANAGER' },
                select: { id: true, name: true, email: true },
            });
            if (upperManager && (upperManager.id === user.id || upperManager.id === manager.id)) upperManager = null;
        }

        // b) save as PENDING, assigned to the team lead first (one request per paid / LOP part)
        const created = [];
        let allEmailsSent = true;
        for (const seg of segments) {
            const { token, hash, expiry } = generateActionToken();
            const leave = await prisma.leaveRequest.create({
                data: {
                    userId: user.id,
                    managerId: manager.id,
                    upperManagerId: upperManager ? upperManager.id : null,
                    type: seg.type,
                    startDate: dayStart(seg.startKey),
                    endDate: dayStart(seg.endKey),
                    days: seg.days,
                    reason: seg.lop && seg.type !== input.type ? `${input.reason || ''} (Extra days beyond the ${MONTHLY_PAID_LEAVE_LIMIT} paid leave days a month: LOP)`.trim() : input.reason || null,
                    compensateForDate,
                    siteLocation: input.type === 'OD' ? input.siteLocation || null : null,
                    projectName: input.type === 'OD' ? input.projectName || null : null,
                    status: 'PENDING',
                    actionTokenHash: hash,
                    actionTokenExpiry: expiry,
                },
            });

            // Popup (bottom-right) with Accept / Deny for the team lead
            await prisma.notification.create({
                data: {
                    userId: manager.id,
                    type: 'LEAVE_ACTION',
                    title: `New ${requestWord(seg.type).toLowerCase()} request`,
                    message: `${user.name} requested ${isNonLeaveType(seg.type) ? leaveTypeLabel(seg.type) : `${leaveTypeLabel(seg.type)} leave`} (${seg.startKey} to ${seg.endKey}, ${seg.days} working day${seg.days === 1 ? '' : 's'}). Please accept or deny.`,
                    senderName: user.name,
                    priority: 'HIGH',
                    leaveId: leave.id,
                    actionUrl: manager.role === 'ADMIN' ? '/admin/time-off' : '/dashboard/team',
                    actionText: 'Review request',
                },
            });

            // c) email the manager (from the employee's name, Reply-To the employee)
            const email = await sendLeaveRequestEmail({ leave, employee: user, manager, token });
            if (!email.sent) allEmailsSent = false;
            created.push(leave);
        }

        const lopDays = segments.filter((s) => s.type === 'LOP' && input.type !== 'LOP').reduce((sum, s) => sum + s.days, 0);
        const lopNote = lopDays
            ? ` Only ${MONTHLY_PAID_LEAVE_LIMIT} paid leave days (Sick + Casual) are allowed in a month, so ${lopDays} day${lopDays === 1 ? '' : 's'} ${lopDays === 1 ? 'was' : 'were'} sent as LOP (Loss of Pay).`
            : '';
        const word = requestWord(input.type);
        return NextResponse.json(
            {
                message: (allEmailsSent
                    ? `${word} request sent to ${manager.name}.`
                    : `${word} request saved and assigned to ${manager.name}, but the email could not be sent.`) + lopNote,
                emailSent: allEmailsSent,
                lopDays,
                leave: { ...created[0], actionTokenHash: undefined, actionTokenExpiry: undefined },
                leaves: created.map((l) => ({ ...l, actionTokenHash: undefined, actionTokenExpiry: undefined })),
            },
            { status: 201 }
        );
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to create leave request');
        return NextResponse.json(body, { status });
    }
}

// DELETE /api/leaves?id=...  the employee cancels their own request while it is still waiting for a decision.
// The approver's popup for it is removed and they are told it was cancelled.
export async function DELETE(request) {
    try {
        const user = await requireUser();
        const id = new URL(request.url).searchParams.get('id');
        if (!id) throw new AppError('Request id is required', 400);

        const leave = await prisma.leaveRequest.findUnique({ where: { id }, include: { user: { select: { companyId: true } } } });
        if (!leave || leave.userId !== user.id) throw new AppError('Leave request not found', 404);
        if (leave.autoGenerated) throw new AppError('Automatic deductions cannot be cancelled', 400);
        if (!WAITING_LEAVE_STATUSES.includes(leave.status)) {
            throw new AppError('Only a request that is still waiting for a decision can be cancelled', 409);
        }

        // Atomic: a decision made a moment ago wins over the cancel
        const removed = await prisma.leaveRequest.deleteMany({ where: { id, userId: user.id, status: leave.status } });
        if (removed.count === 0) throw new AppError('This request was just decided and can no longer be cancelled', 409);

        await prisma.notification.deleteMany({ where: { leaveId: id } });

        const approverIds = await currentApproverIds(leave, user.companyId);
        if (approverIds.length) {
            const range = leave.startDate.getTime() === leave.endDate.getTime() ? dayKey(leave.startDate) : `${dayKey(leave.startDate)} to ${dayKey(leave.endDate)}`;
            await prisma.notification.createMany({
                data: approverIds.map((userId) => ({
                    userId,
                    type: 'LEAVE_UPDATE',
                    title: `${requestWord(leave.type)} request cancelled`,
                    message: `${user.name} cancelled their ${isNonLeaveType(leave.type) ? leaveTypeLabel(leave.type) : `${leaveTypeLabel(leave.type)} leave`} request (${range}). Nothing to decide.`,
                    senderName: user.name,
                })),
            });
        }
        return NextResponse.json({ message: 'Request cancelled' });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to cancel the request');
        return NextResponse.json(body, { status });
    }
}

// PATCH approve / reject
//   step 1 (status PENDING): only the assigned team lead (HR: only when nobody is assigned)
//   step 2 (status TEAM_LEAD_APPROVED): only the manager above the team lead
//   step 3 (status MANAGER_APPROVED): HR only
export async function PATCH(request) {
    try {
        const user = await requireUser({ roles: MANAGER_ROLES });
        const { id, status, adminComment } = decisionSchema.parse(await request.json());

        const leave = await prisma.leaveRequest.findUnique({
            where: { id },
            include: { user: { select: { companyId: true } } },
        });
        if (!leave || leave.user.companyId !== user.companyId) throw new AppError('Leave request not found', 404);
        if (leave.userId === user.id) throw new AppError('You cannot decide your own leave request', 403);

        if (!decisionStageFor(leave, user)) {
            if (['PENDING', 'TEAM_LEAD_APPROVED'].includes(leave.status)) throw new AppError('This request is assigned to someone else', 403);
            if (leave.status === 'MANAGER_APPROVED') throw new AppError('Only HR can give the final decision on this request', 403);
            throw new AppError('This request has already been decided or cannot be changed', 409);
        }

        const { leave: updated, emailSent, final } = await decideLeave({
            leaveId: id,
            decision: status,
            comment: adminComment,
            decider: user,
        });

        let message;
        if (!final) {
            message =
                updated.status === 'TEAM_LEAD_APPROVED'
                    ? 'Approved. The request has been sent to the manager.'
                    : 'Approved. The request has been sent to HR for the final decision.';
        }
        else if (updated.status === 'APPROVED') message = 'Leave accepted. The employee has been notified.';
        else message = 'Leave rejected. The employee has been notified.';

        return NextResponse.json({
            message,
            leave: { ...updated, actionTokenHash: undefined, actionTokenExpiry: undefined },
            emailSent,
            final,
        });
    } catch (error) {
        const [body, statusCode] = errorResponseParts(error, 'Failed to update leave request');
        return NextResponse.json(body, { status: statusCode });
    }
}
