import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { AppError, errorResponseParts } from '@/lib/errors';
import { leaveTypeLabel } from '@/lib/constants';
import { dayKey } from '@/lib/dates';
import { decideLeave, hashToken } from '@/lib/leave';

// One-time links from the manager's email. GET only shows details (so mail
// scanners that prefetch links cannot approve anything); POST decides.
async function findByToken(token) {
    if (!token || typeof token !== 'string' || token.length < 32) throw new AppError('Invalid link', 400);
    const leave = await prisma.leaveRequest.findUnique({
        where: { actionTokenHash: hashToken(token) },
        include: {
            user: { select: { name: true, email: true } },
            manager: { select: { id: true, name: true, email: true, role: true } },
        },
    });
    if (!leave || leave.status !== 'PENDING') {
        throw new AppError('This request has already been decided, or the link is no longer valid', 410);
    }
    if (!leave.actionTokenExpiry || leave.actionTokenExpiry < new Date()) {
        throw new AppError('This link has expired. Please use the Keystone portal to decide this request.', 410);
    }
    return leave;
}

export async function GET(request) {
    try {
        const token = new URL(request.url).searchParams.get('token');
        const leave = await findByToken(token);
        return NextResponse.json({
            employee: leave.user.name,
            type: leaveTypeLabel(leave.type),
            startDate: dayKey(leave.startDate),
            endDate: dayKey(leave.endDate),
            days: leave.days,
            reason: leave.reason,
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load request');
        return NextResponse.json(body, { status });
    }
}

export async function POST(request) {
    try {
        const { token, decision, comment } = await request.json();
        const status = decision === 'approve' ? 'APPROVED' : decision === 'reject' ? 'REJECTED' : null;
        if (!status) throw new AppError("decision must be 'approve' or 'reject'", 400);

        if (status === 'REJECTED' && !String(comment || '').trim()) throw new AppError('A reason is required to deny a request', 400);
        const leave = await findByToken(token);
        const { leave: updated, final } = await decideLeave({
            leaveId: leave.id,
            decision: status,
            comment: status === 'REJECTED' ? String(comment).trim().slice(0, 300) : 'Decided via email link',
            decider: leave.manager,
        });
        let message;
        if (!final) message = 'Leave request approved and sent to HR for the final decision';
        else message = `Leave request ${updated.status === 'APPROVED' ? 'approved' : 'rejected'}`;
        return NextResponse.json({ message, status });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to decide request');
        return NextResponse.json(body, { status });
    }
}
