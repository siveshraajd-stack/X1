import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { MANAGER_ROLES } from '@/lib/constants';
import { dayStart } from '@/lib/dates';
import { canDecideExpense, parseExpenseInput } from '@/lib/expense-rules';
import { attachOdInfo, decideExpense, notifyManagerOfClaim } from '@/lib/expense';
import { sendMail } from '@/lib/mailer';

const decisionSchema = z.object({
    id: z.string().min(1),
    status: z.enum(['APPROVED', 'REJECTED']),
    managerComment: z.string().trim().max(300).optional(),
}).refine((d) => d.status !== 'REJECTED' || Boolean(d.managerComment), {
    message: 'A reason is required to deny a claim',
    path: ['managerComment'],
});

const claimInclude = {
    user: { select: { id: true, name: true, employeeId: true, email: true } },
    manager: { select: { id: true, name: true, email: true } },
};

// GET /api/expenses
//   (default)      my own claims
//   ?scope=team    claims for me to decide (manager: assigned to me; admin / HR: every claim of the company)
export async function GET(request) {
    try {
        const user = await requireUser();
        const { searchParams } = new URL(request.url);
        const scope = searchParams.get('scope');

        let where;
        if (scope === 'team') {
            if (!MANAGER_ROLES.includes(user.role)) throw new AppError('Forbidden', 403);
            // HR (admin) gives the final decision, so sees every claim of the company
            where =
                user.role === 'ADMIN'
                    ? { user: { companyId: user.companyId }, userId: { not: user.id } }
                    : { managerId: user.id, userId: { not: user.id } };
        } else {
            where = { userId: user.id };
        }

        const claims = await prisma.expenseClaim.findMany({
            where,
            include: claimInclude,
            orderBy: { createdAt: 'desc' },
        });
        const withOd = await attachOdInfo(claims);
        // Names of the HR team, so "waiting for HR" can show who that is
        const hrRows = user.companyId
            ? await prisma.user.findMany({ where: { companyId: user.companyId, role: 'ADMIN' }, select: { name: true }, orderBy: { name: 'asc' } })
            : [];
        return NextResponse.json({
            claims: withOd.map((c) => ({ ...c, canDecide: canDecideExpense(c, user) })),
            hrNames: hrRows.map((h) => h.name),
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch expense claims');
        return NextResponse.json(body, { status });
    }
}

// Tell every admin that an employee has no reporting manager, so they can fix it.
async function notifyAdminsNoManager(employee) {
    const admins = await prisma.user.findMany({
        where: { companyId: employee.companyId, role: 'ADMIN' },
        select: { id: true, email: true },
    });
    if (!admins.length) return;
    const message = `${employee.name} tried to submit an expense claim but has no reporting manager assigned. Please assign a manager in their profile.`;
    await prisma.notification.createMany({
        data: admins.map((a) => ({
            userId: a.id,
            type: 'EXPENSE_UPDATE',
            title: 'Expense claim blocked: no manager assigned',
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

// POST submit a claim - routed ONLY to the employee's reporting manager
export async function POST(request) {
    try {
        const user = await requireUser();
        if (user.role === 'ADMIN') throw new AppError('Admin accounts do not submit expense claims', 403);
        if (user.role === 'TEAM_LEAD') throw new AppError('Expense claims are not available for team leads', 403);

        const raw = await request.json();
        const input = parseExpenseInput(raw);

        // Reporting manager: the one picked on the form (must be a manager / team lead of the same
        // company, never the employee), otherwise the stored manager link
        const pickedId = typeof raw?.managerId === 'string' && raw.managerId && raw.managerId !== user.id ? raw.managerId : user.managerId;
        let manager = pickedId
            ? await prisma.user.findFirst({
                  where: { id: pickedId, companyId: user.companyId, role: { in: MANAGER_ROLES } },
                  select: { id: true, name: true, email: true, role: true, phone: true, managerId: true },
              })
            : null;
        // Team leads do not handle expense claims: send it to the manager above the team lead,
        // or to HR when the team lead reports straight to HR.
        if (manager && manager.role === 'TEAM_LEAD') {
            const upper = manager.managerId
                ? await prisma.user.findFirst({
                      where: { id: manager.managerId, companyId: user.companyId, role: { in: ['MANAGER', 'ADMIN'] } },
                      select: { id: true, name: true, email: true, role: true, phone: true, managerId: true },
                  })
                : null;
            manager =
                upper ||
                (await prisma.user.findFirst({
                    where: { companyId: user.companyId, role: 'ADMIN' },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true, name: true, email: true, role: true, phone: true, managerId: true },
                }));
        }
        if (!manager) {
            await notifyAdminsNoManager(user);
            throw new AppError(
                'No reporting manager is assigned to you, so this claim cannot be sent. Your admin has been notified.',
                400,
                { code: 'NO_MANAGER' }
            );
        }

        const claim = await prisma.expenseClaim.create({
            data: {
                userId: user.id,
                managerId: manager.id,
                category: input.category,
                travelMode: input.travelMode,
                travelModeOther: input.travelModeOther,
                amount: input.amount,
                fromDate: dayStart(input.fromKey),
                toDate: dayStart(input.toKey),
                journeyStartDate: dayStart(input.journeyKey),
                clientLocation: input.clientLocation,
                projectName: input.projectName,
                receiptAvailable: input.receiptAvailable,
                receiptUrl: input.receiptUrl,
                receiptNote: input.receiptNote,
                description: input.description,
                status: 'PENDING',
            },
        });

        const email = await notifyManagerOfClaim({ claim, employee: user, manager });
        return NextResponse.json(
            {
                message: email.sent
                    ? `Expense claim sent to ${manager.name}`
                    : `Expense claim saved and sent to ${manager.name}'s dashboard (email could not be sent).`,
                emailSent: email.sent,
                claim,
            },
            { status: 201 }
        );
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to submit expense claim');
        return NextResponse.json(body, { status });
    }
}

// PATCH accept / deny
//   step 1 (PENDING)           the assigned reporting manager
//   step 2 (MANAGER_APPROVED)  HR (admin)
export async function PATCH(request) {
    try {
        const user = await requireUser({ roles: MANAGER_ROLES });
        const { id, status, managerComment } = decisionSchema.parse(await request.json());

        const claim = await prisma.expenseClaim.findUnique({
            where: { id },
            include: { user: { select: { companyId: true } } },
        });
        if (!claim || claim.user.companyId !== user.companyId) throw new AppError('Expense claim not found', 404);
        if (claim.userId === user.id) throw new AppError('You cannot decide your own expense claim', 403);
        if (!canDecideExpense(claim, user)) {
            if (!['PENDING', 'MANAGER_APPROVED'].includes(claim.status)) throw new AppError('This claim has already been decided', 409);
            if (claim.status === 'MANAGER_APPROVED') throw new AppError('Only HR can give the final decision on this claim', 403);
            throw new AppError('This claim is assigned to another manager', 403);
        }

        const { claim: updated, emailSent, final } = await decideExpense({
            claimId: id,
            decision: status,
            comment: managerComment,
            decider: user,
        });
        return NextResponse.json({
            message: !final
                ? 'Claim accepted and sent to HR for the final decision.'
                : status === 'APPROVED'
                  ? 'Claim approved. The employee has been notified.'
                  : 'Claim rejected. The employee has been notified.',
            claim: updated,
            emailSent,
        });
    } catch (error) {
        const [body, statusCode] = errorResponseParts(error, 'Failed to update expense claim');
        return NextResponse.json(body, { status: statusCode });
    }
}
