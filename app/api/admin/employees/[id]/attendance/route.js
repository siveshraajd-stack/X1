import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { getEmployeeMonth } from '@/lib/attendance-core';
import { dayKey, monthKeyOf, parseMonthKey } from '@/lib/dates';
import { isInTeam } from '@/lib/team';

// GET /api/admin/employees/[id]/attendance?month=YYYY-MM
// Admin: any employee of the company. Manager: everybody under them. Team lead: their direct reports.
export async function GET(request, { params }) {
    try {
        const viewer = await requireUser({ roles: ['ADMIN', 'MANAGER', 'TEAM_LEAD'] });
        const { id } = await params;
        const { searchParams } = new URL(request.url);

        const parsed = parseMonthKey(searchParams.get('month') || monthKeyOf());
        if (!parsed) throw new AppError('Invalid month. Use YYYY-MM', 400);

        const employee = await prisma.user.findUnique({
            where: { id },
            select: { id: true, name: true, createdAt: true, companyId: true, managerId: true },
        });
        if (!employee || employee.companyId !== viewer.companyId) throw new AppError('Employee not found', 404);
        if (viewer.role !== 'ADMIN' && employee.id !== viewer.id && !(await isInTeam(viewer, employee.id))) throw new AppError('Forbidden', 403);

        const now = new Date();
        const data = await getEmployeeMonth(employee, parsed.year, parsed.month, now);
        return NextResponse.json({
            employee: { id: employee.id, name: employee.name },
            month: parsed.key,
            today: dayKey(now),
            startDate: data.trackingStart,
            ...data,
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch attendance');
        return NextResponse.json(body, { status });
    }
}
