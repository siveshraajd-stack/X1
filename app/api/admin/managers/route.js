import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';

// GET managers of the admin's company (MANAGER and ADMIN accounts) for the dropdown
export async function GET() {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const managers = await prisma.user.findMany({
            where: { companyId: admin.companyId, role: { in: ['TEAM_LEAD', 'MANAGER', 'ADMIN'] } },
            select: { id: true, name: true, email: true, role: true, employeeId: true },
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
        });
        return NextResponse.json({ managers });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch managers');
        return NextResponse.json(body, { status });
    }
}
