import { prisma } from '@/lib/db';

// Who a Manager / Team Lead is responsible for.
//   TEAM_LEAD  the people who report directly to them
//   MANAGER    their direct reports AND everybody below those reports (team leads and their teams)
const MAX_DEPTH = 5;

/** Ids of the people `user` is responsible for (never includes the user). */
export async function getTeamIds(user) {
    if (!user?.companyId) return [];
    if (user.role === 'TEAM_LEAD') {
        const rows = await prisma.user.findMany({
            where: { companyId: user.companyId, managerId: user.id },
            select: { id: true },
        });
        return rows.map((r) => r.id);
    }
    if (user.role !== 'MANAGER') return [];

    const seen = new Set([user.id]);
    let frontier = [user.id];
    for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth += 1) {
        const rows = await prisma.user.findMany({
            where: { companyId: user.companyId, managerId: { in: frontier }, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } },
            select: { id: true },
        });
        frontier = rows.map((r) => r.id).filter((id) => !seen.has(id));
        frontier.forEach((id) => seen.add(id));
    }
    seen.delete(user.id);
    return [...seen];
}

/** True when `targetId` is inside the team of `user` (HR is allowed everywhere in the company). */
export async function isInTeam(user, targetId) {
    if (user.role === 'ADMIN') return true;
    const ids = await getTeamIds(user);
    return ids.includes(targetId);
}
