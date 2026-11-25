import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { dayStart } from '@/lib/dates';

// GET ?view=present|leave|od|wfh|absent&search=...
// Live status for today (Indian calendar day). Same rules as the HR dashboard tiles:
//   od      = marked OD (On Duty) today, e.g. an approved OD claim. OD is never counted as present / absent
//   wfh     = marked WFH today (an approved Work From Home request). Also its own state
//   present = biometric check-in or web clock-in today (and not OD / WFH)
//   leave   = approved leave covering today (and not present / OD / WFH). A WFH request is not leave
//   absent  = everyone else
// Rows use the same shape as /api/attendance so the attendance table can show them.
export async function GET(request) {
    try {
        const user = await requireUser({ roles: ['ADMIN'] });
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view');
        const search = (searchParams.get('search') || '').trim().toLowerCase();
        if (!['present', 'leave', 'od', 'wfh', 'absent'].includes(view)) throw new AppError('Invalid view', 400);

        const staffWhere = { companyId: user.companyId, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } };
        const startOfToday = dayStart(new Date());
        const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

        const [staff, todays, leaves] = await Promise.all([
            prisma.user.findMany({ where: staffWhere, select: { id: true, name: true, employeeId: true }, orderBy: { name: 'asc' } }),
            prisma.attendance.findMany({ where: { user: staffWhere, date: { gte: startOfToday, lte: endOfToday } } }),
            prisma.leaveRequest.findMany({
                where: { user: staffWhere, startDate: { lte: endOfToday }, endDate: { gte: startOfToday }, status: 'APPROVED' },
                select: { userId: true, type: true },
            }),
        ]);

        const byUser = new Map(todays.map((a) => [a.userId, a]));
        const leaveIds = new Set(leaves.filter((l) => !['WFH', 'OD'].includes(l.type)).map((l) => l.userId));
        const isPresent = (a) => !!(a && (a.checkIn || a.clockIn));

        const rows = [];
        for (const u of staff) {
            if (search && !(u.name || '').toLowerCase().includes(search) && !(u.employeeId || '').toLowerCase().includes(search)) continue;
            const a = byUser.get(u.id);
            const onDuty = String(a?.status || '').toUpperCase() === 'OD';
            const onWfh = !onDuty && String(a?.status || '').toUpperCase() === 'WFH';
            const present = isPresent(a) && !onDuty && !onWfh;
            const onLeave = !present && !onDuty && !onWfh && leaveIds.has(u.id);
            const base = { id: a?.id || `${view}-${u.id}`, user: { name: u.name, employeeId: u.employeeId }, checkIn: a?.checkIn || null, checkOut: a?.checkOut || null, clockIn: a?.clockIn || null, clockOut: a?.clockOut || null };
            if (view === 'present' && present) rows.push({ ...base, status: a.status });
            else if (view === 'od' && onDuty) rows.push({ ...base, status: 'OD' });
            else if (view === 'leave' && onLeave) rows.push({ ...base, status: 'LEAVE' });
            else if (view === 'wfh' && onWfh) rows.push({ ...base, status: 'WFH' });
            else if (view === 'absent' && !present && !onLeave && !onDuty && !onWfh) rows.push({ ...base, status: 'ABSENT' });
        }
        return NextResponse.json({ attendance: rows });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch today status');
        return NextResponse.json(body, { status });
    }
}
