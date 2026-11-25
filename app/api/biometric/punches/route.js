import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { MAX_PUNCHES_PER_REQUEST, processPunches, resolveCompanyId, verifyApiKey } from '@/lib/biometric';

// POST /api/biometric/punches   (called by the fingerprint machine / its cloud service)
//   header  x-api-key: <BIOMETRIC_API_KEY>   (or  Authorization: Bearer <key>)
//   body    one punch, an array, or { punches: [...] } / { data: [...] }
//           punch = { biometricId, timestamp, deviceId?, direction? } (common vendor field names also work)
export async function POST(request) {
    try {
        const header = request.headers.get('x-api-key') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
        if (!verifyApiKey(header)) throw new AppError('Invalid API key', 401);

        const body = await request.json().catch(() => null);
        const list = Array.isArray(body) ? body : Array.isArray(body?.punches) ? body.punches : Array.isArray(body?.data) ? body.data : body && typeof body === 'object' ? [body] : null;
        if (!list || list.length === 0) throw new AppError('Send a punch or a list of punches', 400);
        if (list.length > MAX_PUNCHES_PER_REQUEST) throw new AppError(`At most ${MAX_PUNCHES_PER_REQUEST} punches per request`, 413);

        const companyId = await resolveCompanyId();
        const summary = await processPunches(companyId, list);
        return NextResponse.json({ ok: true, ...summary, rejected: summary.rejected.slice(0, 20) });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to process punches');
        return NextResponse.json(body, { status });
    }
}

// GET (admin) recent punches for the Biometric page; ?status=UNMAPPED to filter
export async function GET(request) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const status = new URL(request.url).searchParams.get('status');
        const where = { companyId: admin.companyId, ...(status ? { status } : {}) };
        const [punches, counts] = await Promise.all([
            prisma.biometricPunch.findMany({
                where,
                orderBy: { punchTime: 'desc' },
                take: 200,
                include: { user: { select: { name: true, employeeId: true } } },
            }),
            prisma.biometricPunch.groupBy({ by: ['status'], where: { companyId: admin.companyId }, _count: true }),
        ]);
        return NextResponse.json({
            punches,
            counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
            configured: Boolean(process.env.BIOMETRIC_API_KEY),
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch punches');
        return NextResponse.json(body, { status });
    }
}
