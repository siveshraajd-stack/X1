import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';
import { computeHourTotals, hoursQueryRange } from '@/lib/work-hours';

// GET /api/attendance/hours -> hours worked today / this week (Mon-Sun) / this month for the logged in user
export async function GET() {
    try {
        const user = await requireUser();
        const now = new Date();
        const { start, end } = hoursQueryRange(now);
        const records = await prisma.attendance.findMany({
            where: { userId: user.id, date: { gte: start, lt: end } },
        });
        return NextResponse.json(computeHourTotals(records, now));
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch hours worked');
        return NextResponse.json(body, { status });
    }
}
