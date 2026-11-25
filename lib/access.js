import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';

/** Logged in user (fresh from the DB) or throws 401. */
export async function requireUser({ roles } = {}) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new AppError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            companyId: true,
            managerId: true,
            managerEmail: true,
            createdAt: true,
            mustChangePassword: true,
        },
    });
    if (!user) throw new AppError('Unauthorized', 401);
    if (roles && !roles.includes(user.role)) throw new AppError('Forbidden', 403);
    return user;
}

/** Throws unless `target` belongs to the same company as `user`. */
export function assertSameCompany(user, target) {
    if (!user.companyId || !target || target.companyId !== user.companyId) {
        throw new AppError('Not found', 404);
    }
}

/** Valid manager of the company (role MANAGER or ADMIN) or throws. */
export async function resolveManager(companyId, managerId, managerEmail) {
    const manager = await prisma.user.findFirst({
        where: { id: managerId, companyId, role: { in: ['TEAM_LEAD', 'MANAGER', 'ADMIN'] } },
        select: { id: true, name: true, email: true, role: true },
    });
    if (!manager) throw new AppError('Selected manager was not found in your company', 400);
    if (managerEmail && manager.email.toLowerCase() !== managerEmail.toLowerCase()) {
        throw new AppError("Manager's email does not match the selected manager", 400);
    }
    return manager;
}
