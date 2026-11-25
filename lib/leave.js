import crypto from 'crypto';
import { prisma } from '@/lib/db';
import {
    BALANCE_LEAVE_TYPES,
    LEAVE_QUOTAS,
    MONTHLY_PAID_LEAVE_LIMIT,
    LEAVE_ACTION_TOKEN_TTL_MS,
    OPEN_LEAVE_STATUSES,
    WAITING_LEAVE_STATUSES,
    WEEKEND_DAYS,
    isNonLeaveType,
    isWfhType,
    leaveNoun,
    requestWord,
    leaveTypeLabel,
} from '@/lib/constants';
import { dayKey, dayStart, eachDayKey, weekdayOfKey, yearRange } from '@/lib/dates';
import { AppError } from '@/lib/errors';
import { appBaseUrl, escapeHtml, sendMail } from '@/lib/mailer';
import { personLabel } from '@/lib/people';

export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateActionToken() {
    const token = crypto.randomBytes(32).toString('hex');
    return { token, hash: hashToken(token), expiry: new Date(Date.now() + LEAVE_ACTION_TOKEN_TTL_MS) };
}

/**
 * Yearly quotas of one person. HR sets them when the account is created (and can edit them later);
 * the defaults in LEAVE_QUOTAS apply when nothing was set.
 */
export async function getLeaveQuotas(userId) {
    const quotas = { ...LEAVE_QUOTAS };
    try {
        const row = await prisma.user.findUnique({ where: { id: userId }, select: { sickLeaveQuota: true, casualLeaveQuota: true } });
        if (Number.isInteger(row?.sickLeaveQuota)) quotas.SICK = row.sickLeaveQuota;
        if (Number.isInteger(row?.casualLeaveQuota)) quotas.CASUAL = row.casualLeaveQuota;
    } catch {
        /* keep the defaults */
    }
    return quotas;
}

/**
 * Yearly balance per category: Sick and Casual (8 each by default, HR can change them per person).
 * "used" counts only fully ACCEPTED requests, so the number drops the moment a request
 * becomes APPROVED. The totals (allowance / used / remaining) add up both categories.
 */
export async function getLeaveBalance(userId, year, { excludeLeaveId } = {}) {
    const { start, end } = yearRange(year);
    const quotas = await getLeaveQuotas(userId);
    const leaves = await prisma.leaveRequest.findMany({
        where: {
            userId,
            status: 'APPROVED',
            type: { in: BALANCE_LEAVE_TYPES },
            startDate: { gte: start, lt: end },
        },
        select: { id: true, type: true, days: true },
    });
    const byType = {};
    for (const type of BALANCE_LEAVE_TYPES) {
        const allowance = quotas[type];
        const used = leaves
            .filter((l) => l.type === type && !(excludeLeaveId && l.id === excludeLeaveId))
            .reduce((sum, l) => sum + (l.days || 0), 0);
        byType[type.toLowerCase()] = { type, allowance, used, remaining: Math.max(0, allowance - used) };
    }
    const allowance = BALANCE_LEAVE_TYPES.reduce((sum, t) => sum + quotas[t], 0);
    const used = BALANCE_LEAVE_TYPES.reduce((sum, t) => sum + byType[t.toLowerCase()].used, 0);
    return { year, ...byType, allowance, used, remaining: Math.max(0, allowance - used) };
}

/** Days already asked for in requests that are still waiting for a decision (not yet deducted). */
export async function getPendingLeaveDays(userId, year, type) {
    const { start, end } = yearRange(year);
    const leaves = await prisma.leaveRequest.findMany({
        where: {
            userId,
            type,
            status: { in: WAITING_LEAVE_STATUSES },
            startDate: { gte: start, lt: end },
        },
        select: { days: true },
    });
    return leaves.reduce((sum, l) => sum + (l.days || 0), 0);
}

/**
 * Throws when a Sick / Casual request is bigger than what is left of that category.
 * `reserved` = days of other still-open requests of the same category (already promised).
 */
export function assertWithinQuota({ type, days, remaining, reserved = 0, allowance }) {
    if (!BALANCE_LEAVE_TYPES.includes(type)) return;
    const available = Math.max(0, remaining - reserved);
    if (days > available) {
        throw new AppError(
            `Not enough ${leaveTypeLabel(type)} leave. ${leaveTypeLabel(type)} allowance is ${allowance ?? LEAVE_QUOTAS[type]} days a year; ` +
                `you have ${available} day${available === 1 ? '' : 's'} left and asked for ${days}.`,
            400,
            { code: 'INSUFFICIENT_BALANCE' }
        );
    }
}

/** Working day keys between two day keys (inclusive), skipping weekends and company holidays. */
export async function workingDayKeys(companyId, startKey, endKey) {
    const holidays = companyId
        ? await prisma.holiday.findMany({
              where: { companyId, date: { gte: dayStart(startKey), lte: dayStart(endKey) } },
              select: { date: true },
          })
        : [];
    const holidayKeys = new Set(holidays.map((h) => dayKey(h.date)));
    return eachDayKey(startKey, endKey).filter((key) => !WEEKEND_DAYS.includes(weekdayOfKey(key)) && !holidayKeys.has(key));
}

/** Working days between two day keys (inclusive), skipping weekends and company holidays. */
export async function countWorkingDays(companyId, startKey, endKey) {
    return (await workingDayKeys(companyId, startKey, endKey)).length;
}

/**
 * Paid (Sick + Casual) leave days already used or promised in each of the given months ("YYYY-MM").
 * Counts every open request (waiting for a decision or approved), day by day.
 * `excludeLeaveId` leaves one request out of the count.
 * Returns { "2026-11": 1, ... } with an entry for every asked month.
 */
export async function getMonthlyPaidUsage(userId, companyId, months, { excludeLeaveId } = {}) {
    const used = Object.fromEntries(months.map((m) => [m, 0]));
    if (!months.length) return used;
    const sorted = [...months].sort();
    const [lastYear, lastMonth] = sorted[sorted.length - 1].split('-').map(Number);
    const rangeStart = dayStart(`${sorted[0]}-01`);
    const rangeEnd = dayStart(`${lastMonth === 12 ? lastYear + 1 : lastYear}-${String(lastMonth === 12 ? 1 : lastMonth + 1).padStart(2, '0')}-01`);
    const leaves = await prisma.leaveRequest.findMany({
        where: {
            userId,
            type: { in: BALANCE_LEAVE_TYPES },
            status: { in: OPEN_LEAVE_STATUSES },
            startDate: { lt: rangeEnd },
            endDate: { gte: rangeStart },
        },
        select: { id: true, startDate: true, endDate: true },
    });
    for (const leave of leaves) {
        if (excludeLeaveId && leave.id === excludeLeaveId) continue;
        const keys = await workingDayKeys(companyId, dayKey(leave.startDate), dayKey(leave.endDate));
        for (const key of keys) {
            const month = key.slice(0, 7);
            if (month in used) used[month] += 1;
        }
    }
    return used;
}

/**
 * Monthly paid-leave rule: an employee gets MONTHLY_PAID_LEAVE_LIMIT (2) paid days a month, Sick and
 * Casual together. Every Sick / Casual day beyond that (or beyond the yearly quota of that category)
 * is LOP (Loss of Pay).
 *
 * Returns the request split into consecutive segments: [{ type, startKey, endKey, days, lop }].
 * Types other than Sick / Casual (Earned, LOP, WFH, OD, ...) come back as one segment, unchanged.
 * `yearlyAvailable` = days of this category still free in the yearly quota (after pending requests).
 */
export async function planLeaveSegments({ userId, companyId, type, startKey, endKey, yearlyAvailable = Infinity }) {
    const keys = await workingDayKeys(companyId, startKey, endKey);
    if (!keys.length) return [];
    if (!BALANCE_LEAVE_TYPES.includes(type)) {
        return [{ type, startKey: keys[0], endKey: keys[keys.length - 1], days: keys.length, lop: type === 'LOP' }];
    }
    const months = [...new Set(keys.map((k) => k.slice(0, 7)))];
    const used = await getMonthlyPaidUsage(userId, companyId, months);
    let yearlyLeft = yearlyAvailable;
    const segments = [];
    for (const key of keys) {
        const month = key.slice(0, 7);
        const paid = used[month] < MONTHLY_PAID_LEAVE_LIMIT && yearlyLeft > 0;
        if (paid) {
            used[month] += 1;
            yearlyLeft -= 1;
        }
        const segType = paid ? type : 'LOP';
        const last = segments[segments.length - 1];
        if (last && last.type === segType) {
            last.endKey = key;
            last.days += 1;
        } else {
            segments.push({ type: segType, startKey: key, endKey: key, days: 1, lop: !paid });
        }
    }
    return segments;
}

export async function findOverlappingLeave(userId, startDate, endDate) {
    return prisma.leaveRequest.findFirst({
        where: {
            userId,
            status: { in: OPEN_LEAVE_STATUSES },
            startDate: { lte: endDate },
            endDate: { gte: startDate },
        },
        select: { id: true, startDate: true, endDate: true, status: true },
    });
}

function fmtDate(date) {
    return dayKey(date).split('-').reverse().join('-'); // DD-MM-YYYY
}

/** Email to the manager with Approve / Reject buttons. */
export async function sendLeaveRequestEmail({ leave, employee, manager, token }) {
    const base = appBaseUrl();
    const approveUrl = `${base}/leave-action?token=${token}&action=approve`;
    const rejectUrl = `${base}/leave-action?token=${token}&action=reject`;
    const range = `${fmtDate(leave.startDate)} to ${fmtDate(leave.endDate)}`;
    const label = leaveTypeLabel(leave.type);

    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">Leave request from ${escapeHtml(employee.name)}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:6px 0;color:#666;width:130px">Employee</td><td><b>${escapeHtml(employee.name)}</b> (${escapeHtml(employee.email)})</td></tr>
    <tr><td style="padding:6px 0;color:#666">Leave type</td><td>${escapeHtml(label)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">From - To</td><td>${escapeHtml(range)} (${leave.days} working day${leave.days === 1 ? '' : 's'})</td></tr>
    <tr><td style="padding:6px 0;color:#666;vertical-align:top">Reason</td><td>${escapeHtml(leave.reason || '-')}</td></tr>${leave.compensateForDate ? `
    <tr><td style="padding:6px 0;color:#666">Worked on</td><td>${escapeHtml(leave.compensateForDate)} (compensated by this leave)</td></tr>` : ''}${leave.siteLocation || leave.projectName ? `
    <tr><td style="padding:6px 0;color:#666">Site / Project</td><td>${escapeHtml([leave.siteLocation, leave.projectName].filter(Boolean).join(' / '))}</td></tr>` : ''}
  </table>
  <p style="margin:24px 0">
    <a href="${approveUrl}" style="background:#16a34a;color:#fff;padding:12px 22px;text-decoration:none;font-weight:bold;margin-right:10px">Approve</a>
    <a href="${rejectUrl}" style="background:#dc2626;color:#fff;padding:12px 22px;text-decoration:none;font-weight:bold">Reject</a>
  </p>
  <p style="font-size:12px;color:#666">The links open a confirmation page and expire in 7 days. You can also decide from the Keystone portal. Reply to this email to reach ${escapeHtml(employee.name)} directly.</p>
</div>`;
    const text = [
        `Leave request from ${employee.name} (${employee.email})`,
        `Type: ${label}`,
        `From - To: ${range} (${leave.days} working day(s))`,
        `Reason: ${leave.reason || '-'}`,
        ...(leave.compensateForDate ? [`Worked on: ${leave.compensateForDate}`] : []),
        '',
        `Approve: ${approveUrl}`,
        `Reject: ${rejectUrl}`,
    ].join('\n');

    return sendMail({
        to: manager.email,
        subject: `Leave request: ${employee.name} - ${label} (${range})`,
        html,
        text,
        fromName: employee.name,
        senderEmail: employee.email,
        replyTo: employee.email,
    });
}

/** Final result email back to the employee (only sent when the request is fully decided). */
async function sendDecisionEmail({ leave, employee, decider, comment, byLabel }) {
    const approved = leave.status === 'APPROVED';
    const range = `${fmtDate(leave.startDate)} to ${fmtDate(leave.endDate)}`;
    const label = leaveTypeLabel(leave.type);
    const noun = leaveNoun(leave.type); // "Casual leave" / "Work From Home request"
    const what = isNonLeaveType(leave.type) ? `${requestWord(leave.type).toLowerCase()} request` : 'leave request';
    const who = personLabel(decider, byLabel);
    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">${approved ? `Your ${what} is accepted` : `Your ${what} was not accepted`}</h2>
  <p style="font-size:14px">${escapeHtml(noun)}, ${escapeHtml(range)}.</p>
  ${comment ? `<p style="font-size:14px"><b>Comment:</b> ${escapeHtml(comment)}</p>` : ''}
  <p style="font-size:12px;color:#666">Decided by ${escapeHtml(who)}.</p>
</div>`;
    return sendMail({
        to: employee.email,
        subject: `${requestWord(leave.type)} ${approved ? 'accepted' : 'not accepted'} by ${who}: ${label} (${range})`,
        html,
        text: `Your ${noun} (${range}) was ${approved ? 'accepted' : 'not accepted'} by ${who}.${comment ? ` Comment: ${comment}` : ''}`,
        fromName: decider?.name || 'Keystone',
        senderEmail: decider?.email,
        replyTo: decider?.email,
    });
}

const STAGE_BY_STATUS = { PENDING: 'TEAM_LEAD', TEAM_LEAD_APPROVED: 'MANAGER', MANAGER_APPROVED: 'HR' };

/** Name shown to people for a step of the chain. */
export function stageLabel(stage, leave) {
    if (stage === 'HR') return 'HR';
    if (stage === 'MANAGER') return 'Manager';
    // The first approver is a "Team Lead" only when a manager sits above them; otherwise they are the manager.
    return leave?.upperManagerId ? 'Team Lead' : 'Manager';
}

/**
 * Who may decide this request right now, and in which step?
 *   'TEAM_LEAD'  step 1: the assigned team lead (HR only when nobody is assigned)
 *   'MANAGER'    step 2: the manager above the team lead (HR only when that manager no longer exists)
 *   'HR'         step 3: any HR (ADMIN) once the manager side has approved
 *   null         nobody (own request, auto-generated, already final, or not your request)
 */
export function decisionStageFor(leave, user) {
    if (!leave || !user || leave.autoGenerated || leave.userId === user.id) return null;
    const isAdmin = user.role === 'ADMIN';
    if (leave.status === 'PENDING') {
        if (leave.managerId === user.id) return 'TEAM_LEAD';
        if (isAdmin && !leave.managerId) return 'TEAM_LEAD';
        return null;
    }
    if (leave.status === 'TEAM_LEAD_APPROVED') {
        if (leave.upperManagerId === user.id) return 'MANAGER';
        if (isAdmin && !leave.upperManagerId) return 'MANAGER';
        return null;
    }
    if (leave.status === 'MANAGER_APPROVED') return isAdmin ? 'HR' : null;
    return null;
}

/**
 * Approve or reject a leave. Authorization is the caller's job (see decisionStageFor).
 *
 *   PENDING + team lead approves            -> TEAM_LEAD_APPROVED, the manager is notified
 *                                              (no manager above the team lead: -> MANAGER_APPROVED, HR is notified)
 *   TEAM_LEAD_APPROVED + manager approves   -> MANAGER_APPROVED, HR is notified
 *   MANAGER_APPROVED + HR approves          -> APPROVED, employee is told
 *   anybody rejects                         -> REJECTED, employee is told who rejected it
 *
 * If the person deciding an early step is HR themselves (they are the assigned approver, or nobody
 * is assigned) there is no further step: their decision is final.
 *
 * The conditional updateMany makes the decision atomic, so a double click or an
 * email-link + portal click cannot decide the same request twice.
 */
export async function decideLeave({ leaveId, decision, comment, decider }) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
        throw new AppError('Status must be APPROVED or REJECTED', 400);
    }

    const current = await prisma.leaveRequest.findUnique({
        where: { id: leaveId },
        select: {
            status: true,
            autoGenerated: true,
            userId: true,
            type: true,
            days: true,
            startDate: true,
            upperManagerId: true,
        },
    });
    if (!current || current.autoGenerated || !STAGE_BY_STATUS[current.status]) {
        throw new AppError('This request has already been decided or cannot be changed', 409);
    }

    if (decision === 'REJECTED' && !String(comment || '').trim()) {
        throw new AppError('A reason is required to deny a request', 400);
    }
    const stage = STAGE_BY_STATUS[current.status];
    const hasUpper = Boolean(current.upperManagerId);
    const deciderIsHr = decider?.role === 'ADMIN';
    if (stage === 'HR' && !deciderIsHr) {
        throw new AppError('Only HR can give the final decision on this request', 403);
    }
    // HR deciding an early step has the last word. A team lead / manager approving only forwards it.
    const isFinal = stage === 'HR' || deciderIsHr || decision === 'REJECTED';
    const now = new Date();
    const cleanComment = String(comment || '').trim() || null;

    // Final acceptance of Sick / Casual leave must fit in what is left of that category.
    // (The count itself goes down automatically: it is the sum of APPROVED requests.)
    if (isFinal && decision === 'APPROVED' && BALANCE_LEAVE_TYPES.includes(current.type)) {
        const year = Number(dayKey(current.startDate).slice(0, 4));
        const balance = await getLeaveBalance(current.userId, year, { excludeLeaveId: leaveId });
        assertWithinQuota({
            type: current.type,
            days: current.days || 0,
            remaining: balance[current.type.toLowerCase()].remaining,
            allowance: balance[current.type.toLowerCase()].allowance,
        });
    }

    const byHr = stage === 'HR' || deciderIsHr;
    const commentField = stage === 'HR' ? 'hrComment' : stage === 'TEAM_LEAD' && hasUpper ? 'teamLeadComment' : 'adminComment';
    let nextStatus;
    if (isFinal) nextStatus = decision;
    else if (stage === 'TEAM_LEAD' && hasUpper) nextStatus = 'TEAM_LEAD_APPROVED';
    else nextStatus = 'MANAGER_APPROVED';

    // Who decided this step: the real name is saved on the request (team lead / manager / HR column)
    const nameField = byHr ? 'hrDecidedByName' : stage === 'TEAM_LEAD' && hasUpper ? 'teamLeadDecidedByName' : 'managerDecidedByName';
    const data = {
        status: nextStatus,
        actionTokenHash: null,
        actionTokenExpiry: null,
        [commentField]: cleanComment,
        [nameField]: decider?.name ? String(decider.name).trim() : null,
    };
    if (isFinal) {
        data.decidedAt = now;
        if (decision === 'REJECTED') {
            data.rejectedBy = byHr ? 'HR' : stage === 'TEAM_LEAD' && hasUpper ? 'TEAM_LEAD' : 'MANAGER';
        }
    }
    if (stage === 'TEAM_LEAD' && hasUpper) data.teamLeadDecidedAt = now;
    else if (stage !== 'HR') data.managerDecidedAt = now;

    const result = await prisma.leaveRequest.updateMany({
        where: { id: leaveId, status: current.status, autoGenerated: false },
        data,
    });
    if (result.count === 0) {
        throw new AppError('This request has already been decided or cannot be changed', 409);
    }

    const leave = await prisma.leaveRequest.findUnique({
        where: { id: leaveId },
        include: { user: { select: { id: true, name: true, email: true, companyId: true } } },
    });
    const range = `${fmtDate(leave.startDate)} to ${fmtDate(leave.endDate)}`;
    const byLabel = byHr ? 'HR' : stageLabel(stage, current);
    const deciderLabel = personLabel(decider, byLabel); // "Ravi Kumar (Team Lead)"
    const deciderName = decider?.name ? String(decider.name).trim() : null; // shown as "From" on the notification
    const noun = leaveNoun(leave.type);

    // Approved but not final: hand the request to the next person. The employee is not told yet.
    if (!isFinal) {
        const message = () =>
            `${leave.user.name}'s ${noun} (${range}) was approved by ${deciderLabel}. Please accept or deny.`;
        if (nextStatus === 'TEAM_LEAD_APPROVED') {
            await prisma.notification.create({
                data: {
                    userId: leave.upperManagerId,
                    type: 'LEAVE_ACTION',
                    title: `${requestWord(leave.type)} request from ${leave.user.name} needs your approval`,
                    message: message(),
                    senderName: deciderName,
                    priority: 'HIGH',
                    leaveId: leave.id,
                    actionUrl: '/dashboard/team',
                    actionText: 'Review request',
                },
            });
            return { leave, emailSent: false, final: false, stage };
        }
        const admins = await prisma.user.findMany({
            where: { companyId: leave.user.companyId, role: 'ADMIN' },
            select: { id: true },
        });
        if (admins.length) {
            await prisma.notification.createMany({
                data: admins.map((a) => ({
                    userId: a.id,
                    type: 'LEAVE_ACTION',
                    title: `${requestWord(leave.type)} approved by ${deciderLabel} - needs HR approval`,
                    message: message(),
                    senderName: deciderName,
                    priority: 'HIGH',
                    leaveId: leave.id,
                    actionUrl: '/admin/time-off',
                    actionText: 'Review request',
                })),
            });
        }
        return { leave, emailSent: false, final: false, stage };
    }

    // Final result (accepted by HR, or rejected by anybody): tell the employee, and say who decided.
    const approved = decision === 'APPROVED';

    // Approved Work From Home / On Duty: the employee shows as WFH / OD on every working day of the request
    let marked = null;
    if (approved && isNonLeaveType(leave.type)) {
        try {
            const att = await import('@/lib/attendance-core'); // lazy: attendance-core imports this file too
            const mark = isWfhType(leave.type) ? att.markWfhDays : att.markOdDays;
            marked = await mark({ userId: leave.userId, fromKey: dayKey(leave.startDate), toKey: dayKey(leave.endDate) });
        } catch (error) {
            console.error('Could not mark attendance for request', leaveId, error);
        }
    }
    const wfh = marked; // kept in the return value for callers
    const wfhNote =
        marked && marked.marked.length
            ? ` Your attendance is now marked ${isWfhType(leave.type) ? 'Work From Home' : 'On Duty (OD)'} for ${marked.marked.length} day${marked.marked.length === 1 ? '' : 's'}.`
            : '';
    const wfhRequest = isNonLeaveType(leave.type);
    const word = requestWord(leave.type);

    await prisma.notification.create({
        data: {
            userId: leave.userId,
            type: 'LEAVE_UPDATE',
            title: approved ? (wfhRequest ? `${word} approved` : 'Leave accepted') : wfhRequest ? `${word} not approved` : 'Leave not accepted',
            message:
                `Your ${noun} (${range}) was ${approved ? 'accepted' : 'not accepted'}` +
                ` by ${deciderLabel}.` +
                `${cleanComment ? ` Comment: ${cleanComment}` : ''}` +
                wfhNote,
            senderName: deciderName,
            priority: approved ? 'NORMAL' : 'HIGH',
            leaveId: leave.id,
            actionUrl: '/dashboard/time-off',
            actionText: 'View leave',
        },
    });

    const email = await sendDecisionEmail({
        leave,
        employee: leave.user,
        decider,
        comment: cleanComment,
        byLabel,
    });
    return { leave, emailSent: email.sent, final: true, stage, wfh };
}

/**
 * The people who still have to accept this request right now:
 *   PENDING -> the team lead / first approver, TEAM_LEAD_APPROVED -> the manager above,
 *   MANAGER_APPROVED -> every HR (ADMIN) of the company. (HR when nobody is assigned to an early step.)
 */
export async function currentApproverIds(leave, companyId) {
    let id = null;
    if (leave.status === 'PENDING') id = leave.managerId;
    else if (leave.status === 'TEAM_LEAD_APPROVED') id = leave.upperManagerId;
    else if (leave.status !== 'MANAGER_APPROVED') return [];
    if (id) return [id];
    const admins = await prisma.user.findMany({ where: { companyId, role: 'ADMIN' }, select: { id: true } });
    return admins.map((a) => a.id);
}
