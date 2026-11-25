import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth-utils';
import { generateEmployeeId, formatEmployeeName } from '@/lib/employee-utils';
import { addEmployeeSchema } from '@/lib/validations/auth';
import { requireUser, resolveManager } from '@/lib/access';
import { reprocessUnmapped } from '@/lib/biometric';
import { storePassword } from '@/lib/password-vault';
import { errorResponseParts } from '@/lib/errors';
import { dayStart } from '@/lib/dates';
import { buildProfileData, saveDocuments } from '@/lib/employee-details';
import { LEAVE_QUOTAS, DEFAULT_TEMP_PASSWORD } from '@/lib/constants';

// POST create new employee (Admin only)
export async function POST(request) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        if (!admin.companyId) {
            return NextResponse.json({ error: 'HR user company not found' }, { status: 400 });
        }

        const body = await request.json();

        // Validates required employee email, manager + manager email, temporary password...
        const validatedData = addEmployeeSchema.parse(body);

        // The manager must exist in this company and the email must belong to them
        const manager = await resolveManager(admin.companyId, validatedData.managerId, validatedData.managerEmail);

        const biometricId = validatedData.biometricId || null;
        if (biometricId) {
            const taken = await prisma.user.findFirst({
                where: { companyId: admin.companyId, biometricId },
                select: { name: true },
            });
            if (taken) {
                return NextResponse.json({ error: `Biometric ID ${biometricId} is already used by ${taken.name}` }, { status: 400 });
            }
        }

        const existingEmail = await prisma.user.findUnique({ where: { email: validatedData.email } });
        if (existingEmail) {
            return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
        }

        const joiningDate = new Date(validatedData.dateOfJoining);
        if (Number.isNaN(joiningDate.getTime())) {
            return NextResponse.json({ error: 'Date of joining is invalid' }, { status: 400 });
        }
        const yearOfJoining = joiningDate.getFullYear();

        // Every new account (employee / team lead / manager) starts with the same temporary password; stored hashed (bcrypt).
        const hashedPassword = await hashPassword(DEFAULT_TEMP_PASSWORD);
        const fullName = formatEmployeeName(validatedData.firstName, validatedData.lastName);

        const result = await prisma.$transaction(async (tx) => {
            const employeeId = await generateEmployeeId(
                validatedData.firstName,
                validatedData.lastName,
                yearOfJoining,
                admin.companyId,
                tx
            );

            const employee = await tx.user.create({
                data: {
                    employeeId,
                    email: validatedData.email,
                    password: hashedPassword,
                    mustChangePassword: true, // forced change on first login
                    biometricId,
                    name: fullName,
                    phone: validatedData.phone || null,
                    role: validatedData.role,
                    sickLeaveQuota: validatedData.sickLeaveQuota ?? LEAVE_QUOTAS.SICK,
                    casualLeaveQuota: validatedData.casualLeaveQuota ?? LEAVE_QUOTAS.CASUAL,
                    companyId: admin.companyId,
                    managerId: manager.id,
                    managerEmail: manager.email.toLowerCase(),
                    emailVerified: true, // Auto-verify for admin-created accounts
                },
            });

            await tx.employeeProfile.create({
                data: {
                    userId: employee.id,
                    dateOfBirth: validatedData.dateOfBirth ? new Date(validatedData.dateOfBirth) : null,
                    gender: validatedData.gender || null,
                    maritalStatus: validatedData.maritalStatus || null,
                    nationality: validatedData.nationality || null,
                    residingAddress: validatedData.residingAddress || null,
                    parentName: validatedData.parentName || null,
                    parentPhone: validatedData.parentPhone || null,
                    personalEmail: validatedData.personalEmail || null,
                    ...(validatedData.details ? buildProfileData(validatedData.details) : {}),
                },
            });

            if (validatedData.details) await saveDocuments(tx, employee.id, validatedData.details);

            await tx.jobDetails.create({
                data: {
                    userId: employee.id,
                    jobPosition: validatedData.jobPosition,
                    department: validatedData.department,
                    dateOfJoining: joiningDate,
                    manager: manager.name,
                    workLocation: validatedData.workLocation || null,
                },
            });

            return employee;
        });

        // Encrypted copy so HR can look the password up later
        await storePassword(result.id, DEFAULT_TEMP_PASSWORD);

        // Punches that arrived before the employee existed are picked up now
        if (biometricId) await reprocessUnmapped(admin.companyId, biometricId).catch((e) => console.error('Biometric reprocess failed', e));

        return NextResponse.json(
            {
                message: 'Employee created successfully',
                employee: {
                    id: result.id,
                    name: result.name,
                    email: result.email,
                    employeeId: result.employeeId,
                    temporaryPassword: DEFAULT_TEMP_PASSWORD,
                    role: result.role,
                    managerName: manager.name,
                    managerEmail: manager.email,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to create employee');
        return NextResponse.json(body, { status });
    }
}

// GET all employees (Admin only)
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Get HR user's company
        const hrUser = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        if (!hrUser || !hrUser.companyId) {
            return NextResponse.json(
                { error: 'HR user company not found' },
                { status: 400 }
            );
        }

        const employees = await prisma.user.findMany({
            where: {
                role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] },
                companyId: hrUser.companyId,
            },
            omit: { password: true, verificationToken: true, verificationTokenExpiry: true },
            include: {
                profile: { omit: { sensitiveEnc: true } },
                jobDetails: true,
                attendance: { where: { date: dayStart(new Date()) } },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json({ employees }, { status: 200 });
    } catch (error) {
        console.error('Get employees error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch employees' },
            { status: 500 }
        );
    }
}
