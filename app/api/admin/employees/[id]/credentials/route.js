import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { hashPassword } from '@/lib/auth-utils';
import { passwordRule } from '@/lib/validations/auth';
import { readPassword, storePassword } from '@/lib/password-vault';

async function loadStaff(admin, id) {
    const target = await prisma.user.findFirst({
        where: { id, companyId: admin.companyId, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } },
        select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            role: true,
            managerEmail: true,
            manager: { select: { name: true, email: true, employeeId: true } },
        },
    });
    if (!target) throw new AppError('Employee not found', 404);
    return target;
}

// GET (HR only): login id, email, password and manager of an employee / manager
export async function GET(request, { params }) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const { id } = await params;
        const target = await loadStaff(admin, id);
        const password = await readPassword(target.id);
        return NextResponse.json(
            {
                credentials: {
                    name: target.name,
                    role: target.role,
                    employeeId: target.employeeId,
                    email: target.email,
                    password, // null when the password was set before this feature existed
                    managerName: target.manager?.name || null,
                    managerEmail: target.manager?.email || target.managerEmail || null,
                    managerId: target.manager?.employeeId || null,
                },
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch credentials');
        return NextResponse.json(body, { status });
    }
}

// PUT (HR only): set a new temporary password; the person must change it at next login
export async function PUT(request, { params }) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const { id } = await params;
        const target = await loadStaff(admin, id);
        const { password } = z.object({ password: passwordRule }).parse(await request.json());

        await prisma.user.update({
            where: { id: target.id },
            data: { password: await hashPassword(password), mustChangePassword: true },
        });
        await storePassword(target.id, password);
        return NextResponse.json({ message: 'Password updated', password });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to update password');
        return NextResponse.json(body, { status });
    }
}
