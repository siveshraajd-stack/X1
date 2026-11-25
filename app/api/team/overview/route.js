import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';
import { buildTeamOverview } from '@/lib/team-overview';

// GET everything the Manager / Team Lead dashboard needs:
// today's roster, approvals waiting for me, upcoming leave, holidays, weekly trend.
// Manager = everybody under them (team leads + their teams). Team lead = their direct reports.
export async function GET() {
    try {
        const user = await requireUser({ roles: ['MANAGER', 'TEAM_LEAD'] });
        const overview = await buildTeamOverview(user);
        return NextResponse.json(overview);
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load dashboard');
        return NextResponse.json(body, { status });
    }
}
