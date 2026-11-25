import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';

// HR, managers and team leads keep their own name here. Every notification, e-mail and
// approval label sent to employees is "from" this name, so it must be a real one.
// personalEmail is where "Forgot password" sends the temporary password.
const STAFF_ROLES = ['ADMIN', 'MANAGER', 'TEAM_LEAD'];

const updateSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be 80 characters or fewer').optional(),
    personalEmail: z.string().trim().email('Enter a valid personal email address').or(z.literal('')).optional(),
});

// GET /api/account/profile -> { name, personalEmail, email, role }
export async function GET() {
    try {
        const user = await requireUser({ roles: STAFF_ROLES });
        const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id }, select: { personalEmail: true } });
        return NextResponse.json({
            name: user.name,
            email: user.email,
            role: user.role,
            personalEmail: profile?.personalEmail || '',
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load your profile');
        return NextResponse.json(body, { status });
    }
}

// PATCH /api/account/profile  { name?, personalEmail? }
export async function PATCH(request) {
    try {
        const user = await requireUser({ roles: STAFF_ROLES });
        const input = updateSchema.parse(await request.json());

        if (input.name && input.name !== user.name) {
            await prisma.user.update({ where: { id: user.id }, data: { name: input.name } });
            // Employees' job details show their manager's name as text: keep it in step
            await prisma.jobDetails.updateMany({ where: { user: { managerId: user.id } }, data: { manager: input.name } });
        }

        if (input.personalEmail !== undefined) {
            const personalEmail = input.personalEmail || null;
            await prisma.employeeProfile.upsert({
                where: { userId: user.id },
                update: { personalEmail },
                create: { userId: user.id, personalEmail },
            });
        }

        const profile = await prisma.employeeProfile.findUnique({ where: { userId: user.id }, select: { personalEmail: true } });
        return NextResponse.json({
            message: 'Saved',
            name: input.name || user.name,
            personalEmail: profile?.personalEmail || '',
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to save your profile');
        return NextResponse.json(body, { status });
    }
}
