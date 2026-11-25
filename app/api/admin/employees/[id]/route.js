import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, resolveManager } from '@/lib/access';
import { reprocessUnmapped } from '@/lib/biometric';
import { AppError, errorResponseParts } from '@/lib/errors';
import { dayStart } from '@/lib/dates';
import { sensitiveSummary } from '@/lib/employee-details';
import { z } from 'zod';

// Never send credentials or tokens to the browser
const SAFE_OMIT = { password: true, verificationToken: true, verificationTokenExpiry: true };

// Admin may change only these fields here
const adminUpdateSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
    phone: z.string().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').optional().or(z.literal('')),
    email: z.string().trim().email('Email is not a valid email address').toLowerCase().optional(),
    employeeId: z.string().trim().min(2, 'Employee ID is too short').max(30, 'Employee ID is too long').toUpperCase().optional(),
    role: z.enum(['EMPLOYEE', 'TEAM_LEAD', 'MANAGER']).optional(),
    managerId: z.string().min(1).optional(),
    managerEmail: z.string().trim().email("Manager's email is not a valid email address").optional(),
    biometricId: z.string().trim().max(40, 'Biometric ID is too long').optional().or(z.literal('')),
    sickLeaveQuota: z.coerce.number().int('Sick leave must be a whole number').min(0, 'Sick leave cannot be negative').max(60, 'Sick leave is too high').optional(),
    casualLeaveQuota: z.coerce.number().int('Casual leave must be a whole number').min(0, 'Casual leave cannot be negative').max(60, 'Casual leave is too high').optional(),
});

// Employees may change only their phone number here
const selfUpdateSchema = z.object({
    phone: z.string().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').optional().or(z.literal('')),
});

async function loadTarget(user, id) {
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, companyId: true, role: true } });
    if (!target) throw new AppError('Employee not found', 404);
    // Everyone (even admins) stays inside their own company
    if (user.id !== target.id && target.companyId !== user.companyId) throw new AppError('Employee not found', 404);
    return target;
}

// GET single employee
export async function GET(request, { params }) {
    try {
        const user = await requireUser();
        const { id } = await params;
        const target = await loadTarget(user, id);

        if (user.role !== 'ADMIN' && user.id !== target.id) throw new AppError('Unauthorized', 401);

        const employee = await prisma.user.findUnique({
            where: { id },
            omit: SAFE_OMIT,
            include: {
                company: true,
                profile: { omit: { sensitiveEnc: true } },
                jobDetails: true,
                documents: true,
                manager: { select: { id: true, name: true, email: true } },
                // Today's attendance only (used for the real-time status badge)
                attendance: { where: { date: { gte: dayStart(new Date()) } } },
            },
        });

        // Sick / Casual quotas are HR-only
        if (user.role !== 'ADMIN') {
            delete employee.sickLeaveQuota;
            delete employee.casualLeaveQuota;
        }

        // Confidential values are never sent here, only which ones exist (they are shown hidden)
        const stored = await prisma.employeeProfile.findUnique({ where: { userId: id }, select: { sensitiveEnc: true } });
        return NextResponse.json(
            { employee: { ...employee, sensitive: sensitiveSummary(stored?.sensitiveEnc, user.role === 'ADMIN') } },
            { status: 200 }
        );
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch employee');
        return NextResponse.json(body, { status });
    }
}

// PUT update employee (whitelisted fields only)
export async function PUT(request, { params }) {
    try {
        const user = await requireUser();
        const { id } = await params;
        const target = await loadTarget(user, id);
        const isAdmin = user.role === 'ADMIN';

        if (!isAdmin && user.id !== id) throw new AppError('Unauthorized', 401);

        const body = await request.json();
        const data = {};

        if (isAdmin) {
            const input = adminUpdateSchema.parse(body);
            if (input.name !== undefined) data.name = input.name;
            if (input.phone !== undefined) data.phone = input.phone || null;

            if (input.email !== undefined) {
                const taken = await prisma.user.findFirst({ where: { email: input.email, NOT: { id } }, select: { name: true } });
                if (taken) throw new AppError(`Email ${input.email} is already used by ${taken.name}`, 400);
                data.email = input.email;
            }
            if (input.employeeId !== undefined && target.role !== 'ADMIN') {
                const taken = await prisma.user.findFirst({ where: { employeeId: input.employeeId, NOT: { id } }, select: { name: true } });
                if (taken) throw new AppError(`Employee ID ${input.employeeId} is already used by ${taken.name}`, 400);
                data.employeeId = input.employeeId;
            }
            if (input.role !== undefined) {
                if (target.role === 'ADMIN') throw new AppError('The role of an admin cannot be changed', 400);
                data.role = input.role;
            }
            if (input.sickLeaveQuota !== undefined) data.sickLeaveQuota = input.sickLeaveQuota;
            if (input.casualLeaveQuota !== undefined) data.casualLeaveQuota = input.casualLeaveQuota;
            if (input.biometricId !== undefined) {
                const biometricId = input.biometricId || null;
                if (biometricId) {
                    const taken = await prisma.user.findFirst({
                        where: { companyId: user.companyId, biometricId, NOT: { id } },
                        select: { name: true },
                    });
                    if (taken) throw new AppError(`Biometric ID ${biometricId} is already used by ${taken.name}`, 400);
                }
                data.biometricId = biometricId;
            }
            if (input.managerId !== undefined) {
                if (!input.managerEmail) throw new AppError("Manager's email is required", 400);
                if (input.managerId === id) throw new AppError('An employee cannot be their own manager', 400);
                const manager = await resolveManager(user.companyId, input.managerId, input.managerEmail);
                data.managerId = manager.id;
                data.managerEmail = manager.email.toLowerCase();
                await prisma.jobDetails.updateMany({ where: { userId: id }, data: { manager: manager.name } });
            }
        } else {
            const input = selfUpdateSchema.parse(body);
            if (input.phone !== undefined) data.phone = input.phone || null;
        }

        const employee = await prisma.user.update({ where: { id }, data, omit: SAFE_OMIT });
        // Keep the copies of this person's details that other people carry in step
        if (data.email) await prisma.user.updateMany({ where: { managerId: id }, data: { managerEmail: data.email } });
        if (data.name) await prisma.jobDetails.updateMany({ where: { user: { managerId: id } }, data: { manager: data.name } });
        if (data.biometricId) {
            // Punches stored as "unknown id" before this assignment now count
            await reprocessUnmapped(user.companyId, data.biometricId).catch((e) => console.error('Biometric reprocess failed', e));
        }
        return NextResponse.json({ message: 'Employee updated successfully', employee }, { status: 200 });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to update employee');
        return NextResponse.json(body, { status });
    }
}

// DELETE employee (Admin only)
export async function DELETE(request, { params }) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const { id } = await params;
        const target = await loadTarget(admin, id);

        if (target.id === admin.id) throw new AppError('You cannot delete your own account', 400);
        if (target.role === 'ADMIN') throw new AppError('Admin accounts cannot be deleted here', 400);

        // Their team would be left without a manager (leave / expense requests would have nobody to go to)
        const reports = await prisma.user.count({ where: { managerId: id } });
        if (reports > 0) {
            throw new AppError(
                `This person is the manager of ${reports} employee${reports === 1 ? '' : 's'}. Assign them to another manager first, then remove this account.`,
                400
            );
        }

        await prisma.user.delete({ where: { id } });
        return NextResponse.json({ message: 'Employee deleted successfully' }, { status: 200 });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to delete employee');
        return NextResponse.json(body, { status });
    }
}
