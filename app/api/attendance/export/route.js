import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { buildMonthDays, getTrackingStart, loadCompanyCalendar } from '@/lib/attendance-core';
import { monthKeyOf, monthRange, parseMonthKey } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const LABELS = {
    PRESENT: 'Present',
    ABSENT: 'Absent',
    LATE: 'Late',
    WFH: 'WFH',
    OD: 'OD',
    HALF_DAY: 'Half Day',
    ON_LEAVE: 'Leave',
    HOLIDAY: 'Holiday',
    WEEKEND: 'Weekly Off',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GET /api/attendance/export?month=YYYY-MM  (HR only)
// Excel: Employee ID | Name | Department | one column per day of the month
export async function GET(request) {
    try {
        const viewer = await requireUser({ roles: ['ADMIN'] });
        const { searchParams } = new URL(request.url);
        const parsed = parseMonthKey(searchParams.get('month') || monthKeyOf());
        if (!parsed) throw new AppError('Invalid month. Use YYYY-MM', 400);

        const { start, end } = monthRange(parsed.year, parsed.month);
        const employees = await prisma.user.findMany({
            where: { companyId: viewer.companyId, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } },
            select: { id: true, name: true, employeeId: true, createdAt: true, companyId: true, jobDetails: { select: { department: true } } },
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
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Monthly Summary');
        let headerDone = false;

        for (const employee of employees) {
            const trackingStart = await getTrackingStart(employee);
            const { days } = buildMonthDays({
                year: parsed.year,
                month: parsed.month,
                records: records.filter((r) => r.userId === employee.id),
                leaves: leaves.filter((l) => l.userId === employee.id),
                holidays: calendar.holidays,
                overrides: calendar.overrides,
                trackingStart,
                now,
            });
            if (!headerDone) {
                ws.addRow([
                    'Employee ID',
                    'Name',
                    'Department',
                    ...days.map((d) => `${d.date.slice(8, 10)} ${MONTHS[parsed.month - 1]} ${parsed.year}`),
                ]);
                headerDone = true;
            }
            ws.addRow([
                employee.employeeId || '',
                employee.name || '',
                employee.jobDetails?.department || '',
                ...days.map((d) => LABELS[d.status] || ''),
            ]);
        }

        if (!headerDone) ws.addRow(['Employee ID', 'Name', 'Department']);
        ws.getRow(1).font = { bold: true };
        ws.getColumn(1).width = 14;
        ws.getColumn(2).width = 26;
        ws.getColumn(3).width = 18;
        for (let c = 4; c <= ws.columnCount; c++) ws.getColumn(c).width = 14;
        ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];

        const buffer = await wb.xlsx.writeBuffer();
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="attendance-summary-${parsed.key}.xlsx"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to export attendance summary');
        return NextResponse.json(body, { status });
    }
}
