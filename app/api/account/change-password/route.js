import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth-utils';
import { changePasswordSchema } from '@/lib/validations/auth';
import { errorResponseParts } from '@/lib/errors';
import { storePassword } from '@/lib/password-vault';

// POST /api/account/change-password  { oldPassword, newPassword, confirmPassword }
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { oldPassword, newPassword } = changePasswordSchema.parse(body);

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, password: true },
        });
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Old password must match the stored (hashed) password
        if (!(await verifyPassword(oldPassword, user.password))) {
            return NextResponse.json({ error: 'Old password is incorrect' }, { status: 400 });
        }

        // Extra safety: also reject a "new" password that hashes to the current one
        if (await verifyPassword(newPassword, user.password)) {
            return NextResponse.json(
                { error: 'New password must be different from the old password' },
                { status: 400 }
            );
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { password: await hashPassword(newPassword), mustChangePassword: false, resetPasswordHash: null, resetPasswordExpiry: null },
        });

        await storePassword(user.id, newPassword);

        return NextResponse.json({ message: 'Password changed successfully' });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to change password');
        return NextResponse.json(body, { status });
    }
}
