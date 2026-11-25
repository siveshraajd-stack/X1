import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';
import { computeHourTotals, computeIdleTotals, hoursQueryRange } from '@/lib/work-hours';

// GET /api/admin/hours -> { hours: { [userId]: { todayMinutes, weekMinutes, monthMinutes, todayIdleMinutes, weekIdleMinutes, monthIdleMinutes } } } (HR only)
export async function GET() {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const now = new Date();
        const { start, end } = hoursQueryRange(now);
        const records = await prisma.attendance.findMany({
            where: {
                date: { gte: start, lt: end },
                user: { companyId: admin.companyId, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } },
            },
        });
        const byUser = new Map();
        for (const r of records) {
            if (!byUser.has(r.userId)) byUser.set(r.userId, []);
            byUser.get(r.userId).push(r);
        }
        // Idle time (no cursor movement) reported by the employees' dashboards
        const episodes = await prisma.idleEpisode.findMany({
            where: {
                date: { gte: start, lt: end },
                user: { companyId: admin.companyId, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } },
            },
            select: { userId: true, date: true, idleSeconds: true },
        });
        const idleByUser = new Map();
        for (const e of episodes) {
            if (!idleByUser.has(e.userId)) idleByUser.set(e.userId, []);
            idleByUser.get(e.userId).push(e);
        }
        const hours = {};
        for (const [userId, rows] of byUser) hours[userId] = computeHourTotals(rows, now);
        for (const [userId, rows] of idleByUser) hours[userId] = { ...(hours[userId] || { todayMinutes: 0, weekMinutes: 0, monthMinutes: 0 }), ...computeIdleTotals(rows, now) };
        return NextResponse.json({ hours });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch hours worked');
        return NextResponse.json(body, { status });
    }
}
