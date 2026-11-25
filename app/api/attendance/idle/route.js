import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';
import { getIdleState, recordIdleEpisode } from '@/lib/idle-server';

// GET  /api/attendance/idle -> tracking state for the employee dashboard (breaks, Teams meetings, idle total)
// POST /api/attendance/idle { startedAt, endedAt } -> report a stretch without cursor movement
// Employees only.
export async function GET() {
    try {
        const user = await requireUser();
        return NextResponse.json(await getIdleState(user));
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load inactivity status');
        return NextResponse.json(body, { status });
    }
}

export async function POST(request) {
    try {
        const user = await requireUser();
        const body = await request.json().catch(() => ({}));
        return NextResponse.json(await recordIdleEpisode(user, { startedAt: body.startedAt, endedAt: body.endedAt }));
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to record inactivity');
        return NextResponse.json(body, { status });
    }
}
