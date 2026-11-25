import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { buildMonthDays, getTrackingStart, loadCompanyCalendar } from '@/lib/attendance-core';
import { monthKeyOf, monthRange, parseMonthKey } from '@/lib/dates';
import { getTeamIds } from '@/lib/team';

// GET /api/attendance/summary?month=YYYY-MM
// Present / Absent / Late / WFH / OD counts per employee for a month.
// Admin: whole company. Manager: everybody under them. Team lead: their direct reports.
export async function GET(request) {
    try {
        const viewer = await requireUser({ roles: ['ADMIN', 'MANAGER', 'TEAM_LEAD'] });
        const { searchParams } = new URL(request.url);
        const parsed = parseMonthKey(searchParams.get('month') || monthKeyOf());
        if (!parsed) throw new AppError('Invalid month. Use YYYY-MM', 400);

        const { start, end } = monthRange(parsed.year, parsed.month);
        const where =
            viewer.role === 'ADMIN'
                ? { companyId: viewer.companyId, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } }
                : { companyId: viewer.companyId, id: { in: await getTeamIds(viewer) } };

        const employees = await prisma.user.findMany({
            where,
            select: { id: true, name: true, employeeId: true, createdAt: true, companyId: true },
            orderBy: { name: 'asc' },
        });
        const ids = employees.map((e) => e.id);

        const [records, leaves, calendar] = await Promise.all([
            prisma.attendance.findMany({ where: { userId: { in: ids }, date: { gte: start, lt: end } } }),
            prisma.leaveRequest.findMany({
                where: { userId: { in: ids }, status: 'APPROVED', startDate: { lt: end }, endDate: { gte: start } },
            }),
            loadCompanyCalendar(viewer.companyId, start, end),
        ]);

        const now = new Date();
        const rows = [];
        for (const employee of employees) {
            const trackingStart = await getTrackingStart(employee);
            const { summary } = buildMonthDays({
                year: parsed.year,
                month: parsed.month,
                records: records.filter((r) => r.userId === employee.id),
                leaves: leaves.filter((l) => l.userId === employee.id),
                holidays: calendar.holidays,
                overrides: calendar.overrides,
                trackingStart,
                now,
            });
            rows.push({
                id: employee.id,
                name: employee.name,
                employeeId: employee.employeeId,
                present: summary.PRESENT,
                absent: summary.ABSENT,
                late: summary.LATE,
                wfh: summary.WFH,
                od: summary.OD,
                onLeave: summary.ON_LEAVE,
                workingDays: summary.workingDays,
            });
        }

        return NextResponse.json({ month: parsed.key, rows });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch attendance summary');
        return NextResponse.json(body, { status });
    }
}
