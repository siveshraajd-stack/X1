import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { readSensitive, SENSITIVE_KEYS } from '@/lib/employee-details';
import { auditLogMiddleware, auditActions, auditResources } from '@/lib/security';

// GET the real (decrypted) bank / salary / PAN / Aadhaar values.
// Only HR (same company) and the person themselves may see them; managers and team leads never can.
// Called only when somebody presses the "show" button.
export async function GET(request, { params }) {
    try {
        const user = await requireUser();
        const { userId } = await params;

        const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, companyId: true } });
        if (!target) throw new AppError('User not found', 404);

        const isSelf = user.id === target.id;
        const isHr = user.role === 'ADMIN' && target.companyId === user.companyId;
        if (!isSelf && !isHr) throw new AppError('Forbidden', 403);

        const profile = await prisma.employeeProfile.findUnique({ where: { userId }, select: { sensitiveEnc: true } });
        const stored = readSensitive(profile?.sensitiveEnc);
        const values = Object.fromEntries(SENSITIVE_KEYS.map((k) => [k, stored[k] || '']));

        await auditLogMiddleware(request, user.id, auditActions.VIEW, auditResources.USER, userId, { what: 'confidential details revealed' });

        return NextResponse.json({ values }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to load confidential details');
        return NextResponse.json(body, { status });
    }
}
