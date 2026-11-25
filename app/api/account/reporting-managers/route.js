import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';

// GET the people an employee can pick as reporting manager on an OD request (managers and team leads of the company)
export async function GET() {
    try {
        const user = await requireUser();
        const managers = await prisma.user.findMany({
            where: { companyId: user.companyId, role: { in: ['TEAM_LEAD', 'MANAGER'] }, id: { not: user.id } },
            select: { id: true, name: true, employeeId: true, role: true },
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
        });
        return NextResponse.json({ managers, currentId: user.managerId || null });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load managers');
        return NextResponse.json(body, { status });
    }
}
