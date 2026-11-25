import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';
import { getTeamIds } from '@/lib/team';

// GET the people under the logged in manager (everybody below) or team lead (direct reports)
export async function GET() {
    try {
        const manager = await requireUser({ roles: ['MANAGER', 'TEAM_LEAD'] });
        const ids = await getTeamIds(manager);
        const members = await prisma.user.findMany({
            where: { id: { in: ids }, companyId: manager.companyId },
            select: {
                id: true,
                name: true,
                email: true,
                employeeId: true,
                role: true,
                jobDetails: { select: { jobPosition: true, department: true } },
            },
            orderBy: { name: 'asc' },
        });
        return NextResponse.json({ members });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load team');
        return NextResponse.json(body, { status });
    }
}
