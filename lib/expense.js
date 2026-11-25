import { prisma } from '@/lib/db';
import { expenseCategoryLabel, travelModeLabel } from '@/lib/constants';
import { dayKey } from '@/lib/dates';
import { AppError } from '@/lib/errors';
import { appBaseUrl, escapeHtml, sendMail } from '@/lib/mailer';
import { sendWhatsApp } from '@/lib/whatsapp';
import { personLabel } from '@/lib/people';
import { markOdDays } from '@/lib/attendance-core';

const fmtDate = (d) => dayKey(d).split('-').reverse().join('-'); // DD-MM-YYYY
const fmtAmount = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Travel - Flight", "Travel - Metro" (typed), "Food" ... */
export function expenseTitle(claim) {
    const base = expenseCategoryLabel(claim.category);
    if (claim.category !== 'TRAVEL' || !claim.travelMode) return base;
    return `${base} - ${claim.travelMode === 'OTHER' ? claim.travelModeOther || 'Other' : travelModeLabel(claim.travelMode)}`;
}

/**
 * For each claim: how many of its days (from -> to) the employee is marked OD in attendance.
 * Shown to the manager as a cross-check; it never blocks a claim.
 */
export async function attachOdInfo(claims) {
    if (!claims.length) return claims;
    const userIds = [...new Set(claims.map((c) => c.userId))];
    const min = new Date(Math.min(...claims.map((c) => c.fromDate.getTime())));
    const max = new Date(Math.max(...claims.map((c) => c.toDate.getTime())));
    const odRows = await prisma.attendance.findMany({
        where: { userId: { in: userIds }, status: 'OD', date: { gte: min, lte: max } },
        select: { userId: true, date: true },
    });
    return claims.map((c) => {
        const totalDays = Math.round((c.toDate - c.fromDate) / 86400000) + 1;
        const odDays = odRows.filter((r) => r.userId === c.userId && r.date >= c.fromDate && r.date <= c.toDate).length;
        return { ...c, odDays, totalDays };
    });
}

const claimRows = (claim, employee) => [
    ['Employee', `${employee.name} (${employee.email})`],
    ['Category', expenseTitle(claim)],
    ['Amount', fmtAmount(claim.amount)],
    ['Project', claim.projectName],
    ['Client location', claim.clientLocation],
    ['Journey started', fmtDate(claim.journeyStartDate)],
    ['Expense dates', `${fmtDate(claim.fromDate)} to ${fmtDate(claim.toDate)}`],
    ['Bill', claim.receiptAvailable ? `Attached: ${appBaseUrl()}${claim.receiptUrl}` : `No bill - ${claim.receiptNote}`],
];

function claimEmailHtml({ heading, rows, footer }) {
    return `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">${escapeHtml(heading)}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;width:140px;vertical-align:top">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}
  </table>
  <p style="font-size:12px;color:#666;margin-top:20px">${escapeHtml(footer)}</p>
</div>`;
}

/** In-app notification + email + WhatsApp to the reporting manager when a claim arrives. */
export async function notifyManagerOfClaim({ claim, employee, manager }) {
    const summary = `${employee.name} submitted an OD expense claim of ${fmtAmount(claim.amount)} (${expenseTitle(claim)}, ${claim.projectName}).`;
    await prisma.notification.create({
        data: {
            userId: manager.id,
            type: 'EXPENSE_UPDATE',
            title: 'New expense claim',
            message: `${summary} Please accept or deny.`,
            senderName: employee.name,
            priority: 'HIGH',
            actionUrl: manager.role === 'ADMIN' ? '/admin/expenses' : '/dashboard/team',
            actionText: 'Review claim',
        },
    });

    const rows = claimRows(claim, employee);
    const whatsapp = await sendWhatsApp({
        to: manager.phone,
        text: `Keystone: New expense claim\n${summary}\nAccept or deny it in your dashboard: ${appBaseUrl()}${manager.role === 'ADMIN' ? '/admin/expenses' : '/dashboard/team'}`,
    });
    const email = await sendMail({
        to: manager.email,
        subject: `Expense claim: ${employee.name} - ${expenseTitle(claim)} (${fmtAmount(claim.amount)})`,
        html: claimEmailHtml({
            heading: `Expense claim from ${employee.name}`,
            rows,
            footer: `Accept or deny it from your Keystone dashboard. Reply to this email to reach ${employee.name} directly.`,
        }),
        text: [`Expense claim from ${employee.name}`, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n'),
        fromName: employee.name,
        senderEmail: employee.email,
        replyTo: employee.email,
    });
    return { ...email, whatsappSent: whatsapp.sent };
}

/** Manager accepted: tell every HR (admin) of the company - in-app, email and WhatsApp. */
async function notifyHrOfClaim({ claim, employee, manager }) {
    const admins = await prisma.user.findMany({
        where: { companyId: employee.companyId, role: 'ADMIN', id: { not: employee.id } },
        select: { id: true, name: true, email: true, phone: true },
    });
    if (!admins.length) return { count: 0 };

    const managerLabel = personLabel(manager, 'Manager');
    const summary = `${employee.name}'s ${expenseTitle(claim)} claim of ${fmtAmount(claim.amount)} (${claim.projectName}) was accepted by ${managerLabel}.`;
    await prisma.notification.createMany({
        data: admins.map((a) => ({
            userId: a.id,
            type: 'EXPENSE_UPDATE',
            title: `Expense claim accepted by ${managerLabel} - needs HR approval`,
            message: `${summary} Please accept or deny.`,
            senderName: manager?.name ? String(manager.name).trim() : null,
            priority: 'HIGH',
            actionUrl: '/admin/expenses',
            actionText: 'Review claim',
        })),
    });

    const rows = [...claimRows(claim, employee), ['Accepted by', managerLabel]];
    if (claim.managerComment) rows.push(['Manager comment', claim.managerComment]);
    await Promise.all(
        admins.flatMap((a) => [
            sendWhatsApp({
                to: a.phone,
                text: `Keystone: Expense claim needs HR approval\n${summary}\nAccept or deny it in your dashboard: ${appBaseUrl()}/admin/expenses`,
            }),
            sendMail({
                to: a.email,
                subject: `HR approval needed: ${employee.name} - ${expenseTitle(claim)} (${fmtAmount(claim.amount)})`,
                html: claimEmailHtml({
                    heading: `Expense claim from ${employee.name} needs HR approval`,
                    rows,
                    footer: 'The reporting manager has accepted this claim. Accept or deny it from the Expense Claims page of your Keystone dashboard.',
                }),
                text: [`Expense claim from ${employee.name} needs HR approval`, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n'),
                fromName: manager?.name || 'Keystone',
                senderEmail: manager?.email,
                replyTo: manager?.email,
            }),
        ])
    );
    return { count: admins.length };
}

const STAGE_BY_STATUS = { PENDING: 'MANAGER', MANAGER_APPROVED: 'HR' };

/**
 * Accept / deny a claim. Authorization is the caller's job (canDecideExpense).
 *
 *   PENDING + manager denies            -> REJECTED, employee is told
 *   PENDING + manager accepts           -> MANAGER_APPROVED, HR is notified (employee is told only at the end)
 *   MANAGER_APPROVED + HR accepts       -> APPROVED, employee is told
 *   MANAGER_APPROVED + HR denies        -> REJECTED, employee is told
 *
 * If HR is itself the assigned approver of the first step (or nobody is assigned) there is no
 * further step: that decision is final.
 *
 * The conditional updateMany (status must still be what we read) makes it atomic, so a double
 * click cannot decide the same step twice.
 */
export async function decideExpense({ claimId, decision, comment, decider }) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new AppError('Status must be APPROVED or REJECTED', 400);

    const current = await prisma.expenseClaim.findUnique({ where: { id: claimId }, select: { status: true } });
    if (decision === 'REJECTED' && !String(comment || '').trim()) throw new AppError('A reason is required to deny a claim', 400);
    const stage = current && STAGE_BY_STATUS[current.status];
    if (!stage) throw new AppError('This claim has already been decided or cannot be changed', 409);

    const deciderIsHr = decider?.role === 'ADMIN';
    if (stage === 'HR' && !deciderIsHr) throw new AppError('Only HR can give the final decision on this claim', 403);

    const byHr = stage === 'HR' || deciderIsHr;
    const isFinal = stage === 'HR' || deciderIsHr || decision === 'REJECTED';
    const now = new Date();
    const cleanComment = String(comment || '').trim() || null;

    const data = { status: isFinal ? decision : 'MANAGER_APPROVED' };
    const deciderName = decider?.name ? String(decider.name).trim() : null;
    if (stage === 'MANAGER') {
        data.managerComment = cleanComment;
        data.managerDecidedAt = now;
    } else {
        data.hrComment = cleanComment;
    }
    // Real name of whoever decided, saved so everyone sees "who" later (HR deciding the first step counts as HR)
    if (byHr) data.hrDecidedByName = deciderName;
    else data.managerDecidedByName = deciderName;
    if (isFinal) {
        data.decidedAt = now;
        if (decision === 'REJECTED') data.rejectedBy = byHr ? 'HR' : 'MANAGER';
    }

    const result = await prisma.expenseClaim.updateMany({ where: { id: claimId, status: current.status }, data });
    if (result.count === 0) throw new AppError('This claim has already been decided or cannot be changed', 409);

    const claim = await prisma.expenseClaim.findUnique({
        where: { id: claimId },
        include: { user: { select: { id: true, name: true, email: true, phone: true, companyId: true } } },
    });

    // Manager accepted: hand it to HR. The employee is not told yet.
    if (!isFinal) {
        await notifyHrOfClaim({ claim, employee: claim.user, manager: decider });
        return { claim, emailSent: false, final: false, stage };
    }

    // Final result (accepted by HR, or denied by anybody): tell the employee who decided.
    const approved = decision === 'APPROVED';
    const byLabel = byHr ? 'HR' : 'Manager';
    const summary = `${expenseTitle(claim)} claim of ${fmtAmount(claim.amount)}`;
    const verdict = approved ? 'approved' : 'rejected';
    const who = personLabel(decider, byLabel); // "Ravi Kumar (Manager)"

    // Approved OD: the employee is marked On Duty (not Present / Late / Absent) on every day of the claim
    let od = null;
    if (approved) {
        try {
            od = await markOdDays({ userId: claim.userId, fromKey: dayKey(claim.fromDate), toKey: dayKey(claim.toDate) });
        } catch (error) {
            console.error('Could not mark OD attendance for claim', claimId, error);
        }
    }
    const odNote =
        od && od.marked.length
            ? ` Your attendance is now marked On Duty (OD) for ${od.marked.length} day${od.marked.length === 1 ? '' : 's'} (${fmtDate(claim.fromDate)} to ${fmtDate(claim.toDate)}).`
            : '';
    const message = `Your ${summary} was ${verdict} by ${who}.${cleanComment ? ` Comment: ${cleanComment}` : ''}${odNote}`;

    await prisma.notification.create({
        data: {
            userId: claim.userId,
            type: 'EXPENSE_UPDATE',
            title: approved ? 'Expense claim approved' : 'Expense claim rejected',
            message,
            senderName: deciderName,
            priority: approved ? 'NORMAL' : 'HIGH',
            actionUrl: '/dashboard/expenses',
            actionText: 'View claim',
        },
    });

    await sendWhatsApp({ to: claim.user.phone, text: `Keystone: ${message}` });
    const email = await sendMail({
        to: claim.user.email,
        subject: `Expense claim ${verdict}: ${expenseTitle(claim)} (${fmtAmount(claim.amount)})`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">Your expense claim was ${verdict}</h2>
  <p style="font-size:14px">${escapeHtml(summary)} (${escapeHtml(claim.projectName)}).</p>
  ${cleanComment ? `<p style="font-size:14px"><b>Comment:</b> ${escapeHtml(cleanComment)}</p>` : ''}
  <p style="font-size:12px;color:#666">Decided by ${escapeHtml(who)}.</p>
</div>`,
        text: message,
        fromName: decider?.name || 'Keystone',
        senderEmail: decider?.email,
        replyTo: decider?.email,
    });
    return { claim, emailSent: email.sent, final: true, stage, od };
}
