import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';
import { decryptSecret } from '@/lib/password-vault';

// GET (HR only): login email + password of every account in the company
// (HR, managers and employees). Passwords come from the encrypted password vault.
export async function GET() {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const users = await prisma.user.findMany({
            where: { companyId: admin.companyId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                employeeId: true,
                passwordVault: { select: { encrypted: true } },
            },
            orderBy: [{ role: 'asc' }, { name: 'asc' }],
        });

        const accounts = users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            employeeId: u.employeeId,
            password: u.passwordVault ? decryptSecret(u.passwordVault.encrypted) : null,
        }));

        return NextResponse.json({ accounts }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch login credentials');
        return NextResponse.json(body, { status });
    }
}
