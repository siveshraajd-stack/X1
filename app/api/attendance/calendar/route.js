import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { getEmployeeMonth } from '@/lib/attendance-core';
import { dayKey, monthKeyOf, parseMonthKey } from '@/lib/dates';

// GET /api/attendance/calendar?month=YYYY-MM  - the logged in user's calendar
export async function GET(request) {
    try {
        const user = await requireUser();
        const { searchParams } = new URL(request.url);
        const parsed = parseMonthKey(searchParams.get('month') || monthKeyOf());
        if (!parsed) throw new AppError('Invalid month. Use YYYY-MM', 400);

        const now = new Date();
        const data = await getEmployeeMonth(user, parsed.year, parsed.month, now);
        return NextResponse.json({
            employee: { id: user.id, name: user.name },
            month: parsed.key,
            today: dayKey(now),
            startDate: data.trackingStart,
            ...data,
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch calendar');
        return NextResponse.json(body, { status });
    }
}
