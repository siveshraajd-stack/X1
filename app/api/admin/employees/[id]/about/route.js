import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';

const aboutSchema = z.object({
    about: z.string().max(3000, 'About is too long').optional(),
    jobLoves: z.string().max(3000, 'This field is too long').optional(),
    interestsHobbies: z.string().max(3000, 'This field is too long').optional(),
});

// PUT (HR only): edit the About section of any employee / manager in the company.
// Only the three About fields are touched; the rest of the profile is left as it is.
export async function PUT(request, { params }) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const { id } = await params;

        const target = await prisma.user.findFirst({
            where: { id, companyId: admin.companyId },
            select: { id: true },
        });
        if (!target) throw new AppError('Employee not found', 404);

        const data = aboutSchema.parse(await request.json());
        const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
        const fields = {};
        if (data.about !== undefined) fields.about = clean(data.about);
        if (data.jobLoves !== undefined) fields.jobLoves = clean(data.jobLoves);
        if (data.interestsHobbies !== undefined) fields.interestsHobbies = clean(data.interestsHobbies);

        const profile = await prisma.employeeProfile.upsert({
            where: { userId: target.id },
            update: fields,
            create: { userId: target.id, ...fields },
            select: { about: true, jobLoves: true, interestsHobbies: true },
        });

        return NextResponse.json({ message: 'About updated', profile });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to update about');
        return NextResponse.json(body, { status });
    }
}
