import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';

const updateSchema = z.object({ managerId: z.string().min(1, 'Please select a team leader') });

// GET the list of team leaders of my company and who my current team leader is (employees only)
export async function GET() {
    try {
        const user = await requireUser({ roles: ['EMPLOYEE'] });
        const [leads, me] = await Promise.all([
            prisma.user.findMany({
                where: { companyId: user.companyId, role: 'TEAM_LEAD', id: { not: user.id } },
                select: { id: true, name: true, employeeId: true, manager: { select: { name: true, role: true } } },
                orderBy: { name: 'asc' },
            }),
            prisma.user.findUnique({
                where: { id: user.id },
                select: { manager: { select: { id: true, name: true, role: true, manager: { select: { name: true, role: true } } } } },
            }),
        ]);
        // Manager above a team lead (only HR can change this). Null when the team lead reports to HR.
        const upperName = (lead) => (lead?.manager?.role === 'MANAGER' ? lead.manager.name : null);
        return NextResponse.json({
            teamLeads: leads.map((l) => ({ id: l.id, name: l.name, employeeId: l.employeeId, managerName: upperName(l) })),
            current: me?.manager ? { id: me.manager.id, name: me.manager.name, role: me.manager.role, managerName: upperName(me.manager) } : null,
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load team leaders');
        return NextResponse.json(body, { status });
    }
}

// PUT choose my team leader. Only a TEAM_LEAD of my own company can be chosen.
// Leave requests are routed to this person first (then their manager, then HR).
export async function PUT(request) {
    try {
        const user = await requireUser({ roles: ['EMPLOYEE'] });
        const { managerId } = updateSchema.parse(await request.json());

        const lead = await prisma.user.findFirst({
            where: { id: managerId, companyId: user.companyId, role: 'TEAM_LEAD' },
            select: { id: true, name: true, email: true, manager: { select: { name: true, role: true } } },
        });
        if (!lead || lead.id === user.id) throw new AppError('Selected team leader was not found in your company', 400);

        await prisma.user.update({
            where: { id: user.id },
            data: { managerId: lead.id, managerEmail: lead.email.toLowerCase() },
        });
        await prisma.jobDetails.updateMany({ where: { userId: user.id }, data: { manager: lead.name } });

        return NextResponse.json({ message: `Your team leader is now ${lead.name}`, current: { id: lead.id, name: lead.name, role: 'TEAM_LEAD', managerName: lead.manager?.role === 'MANAGER' ? lead.manager.name : null } });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to change team leader');
        return NextResponse.json(body, { status });
    }
}
