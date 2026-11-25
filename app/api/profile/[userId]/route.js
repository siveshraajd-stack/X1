import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { isInTeam } from '@/lib/team';
import { detailsSchema } from '@/lib/validations/employee-details';
import { buildProfileData, saveDocuments, sensitiveSummary } from '@/lib/employee-details';

const updateProfileSchema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().regex(/^[0-9]{10}$/).optional().or(z.literal('')),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    maritalStatus: z.string().optional(),
    nationality: z.string().optional(),
    personalEmail: z.string().email().optional().or(z.literal('')),
    residingAddress: z.string().optional(),
    parentName: z.string().trim().max(100).optional().or(z.literal('')),
    parentPhone: z.string().regex(/^[0-9]{10}$/, 'Parent phone number must be 10 digits').optional().or(z.literal('')),
    dateOfJoining: z.string().optional(),
    about: z.string().optional(),
    jobLoves: z.string().optional(),
    interestsHobbies: z.string().optional(),
    jobPosition: z.string().optional(),
    department: z.string().optional(),
    workLocation: z.string().optional(),
    // Extra sections (HR only): personal, PF, family, academic, experience, bank / PAN / Aadhaar, documents
    details: detailsSchema.optional(),
});

export async function GET(request, { params }) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (await params).userId;

        // Employee views own profile, a manager views their team, HR views anyone
        if (!['ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(session.user.role) && session.user.id !== userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                profile: { omit: { sensitiveEnc: true } },
                jobDetails: true,
                documents: true,
                manager: { select: { id: true, name: true, email: true } },
            },
        });

        if (!user || (session.user.id !== userId && user.companyId !== session.user.companyId)) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (['MANAGER', 'TEAM_LEAD'].includes(session.user.role) && session.user.id !== userId && !(await isInTeam(session.user, userId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                employeeId: user.employeeId,
                role: user.role,
                managerId: user.managerId,
                biometricId: user.biometricId,
                managerEmail: user.managerEmail,
                manager: user.manager,
                // Leave quotas are for HR only: the employee's own view never gets them
                ...(session.user.role === 'ADMIN' ? { sickLeaveQuota: user.sickLeaveQuota, casualLeaveQuota: user.casualLeaveQuota } : {}),
            },
            profile: user.profile,
            jobDetails: user.jobDetails,
            documents: user.documents,
            // Only which confidential values exist; the values themselves come from the /sensitive endpoint
            sensitive: sensitiveSummary(
                (await prisma.employeeProfile.findUnique({ where: { userId }, select: { sensitiveEnc: true } }))?.sensitiveEnc,
                session.user.role === 'ADMIN' || session.user.id === userId
            ),
        });
    } catch (error) {
        console.error('Get profile error:', error);
        return NextResponse.json(
            { error: 'An error occurred while fetching profile' },
            { status: 500 }
        );
    }
}

export async function PUT(request, { params }) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = (await params).userId;
        const isAdmin = session.user.role === 'ADMIN';
        const isManager = ['MANAGER', 'TEAM_LEAD'].includes(session.user.role);

        // Only HR and the employee's own manager can edit profile details
        if (!isAdmin && !isManager) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (isManager) {
            const target = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true, managerId: true } });
            if (!target || target.companyId !== session.user.companyId || !(await isInTeam(session.user, userId))) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        if (isAdmin && session.user.id !== userId) {
            const target = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
            if (!target || target.companyId !== session.user.companyId) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
        }

        const body = await request.json();
        const validatedData = updateProfileSchema.parse(body);

        // New sections (family, PF, bank, documents...): HR only
        if (validatedData.details && !isAdmin) {
            return NextResponse.json({ error: 'Only HR can change these details' }, { status: 403 });
        }

        // Update user basic info (only admin can update name)
        if (isAdmin && validatedData.name) {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    name: validatedData.name,
                    phone: validatedData.phone || null,
                },
            });
        } else if (validatedData.phone !== undefined) {
            // Employees can only update phone
            await prisma.user.update({
                where: { id: userId },
                data: {
                    phone: validatedData.phone || null,
                },
            });
        }

        // Update or create profile
        const profileData = {
            dateOfBirth: validatedData.dateOfBirth
                ? new Date(validatedData.dateOfBirth)
                : null,
            gender: validatedData.gender || null,
            maritalStatus: validatedData.maritalStatus || null,
            nationality: validatedData.nationality || null,
            personalEmail: validatedData.personalEmail || null,
            residingAddress: validatedData.residingAddress || null,
            parentName: validatedData.parentName || null,
            parentPhone: validatedData.parentPhone || null,
            about: validatedData.about || null,
            jobLoves: validatedData.jobLoves || null,
            interestsHobbies: validatedData.interestsHobbies || null,
        };

        // A manager changes only the fields that were sent, nothing else is cleared
        const profileUpdate = isAdmin
            ? profileData
            : Object.fromEntries(Object.entries(profileData).filter(([key]) => validatedData[key] !== undefined));

        const existing = validatedData.details
            ? await prisma.employeeProfile.findUnique({ where: { userId }, select: { sensitiveEnc: true } })
            : null;
        const detailsData = validatedData.details ? buildProfileData(validatedData.details, existing?.sensitiveEnc) : {};

        await prisma.employeeProfile.upsert({
            where: { userId: userId },
            update: { ...profileUpdate, ...detailsData },
            create: {
                userId: userId,
                ...profileUpdate,
                ...detailsData,
            },
        });

        if (validatedData.details) await saveDocuments(prisma, userId, validatedData.details);

        // Update job details (HR, or the employee's manager for the fields sent)
        {
            const fullJobData = {
                jobPosition: validatedData.jobPosition || null,
                department: validatedData.department || null,
                workLocation: validatedData.workLocation || null,
                dateOfJoining: validatedData.dateOfJoining ? new Date(validatedData.dateOfJoining) : null,
            };
            const jobData = isAdmin
                ? fullJobData
                : Object.fromEntries(Object.entries(fullJobData).filter(([key]) => validatedData[key] !== undefined));

            if (isAdmin || Object.keys(jobData).length > 0) await prisma.jobDetails.upsert({
                where: { userId: userId },
                update: jobData,
                create: {
                    userId: userId,
                    ...jobData,
                },
            });
        }

        return NextResponse.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);

        if (error.name === 'ZodError') {
            return NextResponse.json(
                { error: error.errors[0].message },
                { status: 400 }
            );
        }
        if (error.name === 'AppError') {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }

        return NextResponse.json(
            { error: 'An error occurred while updating profile' },
            { status: 500 }
        );
    }
}
