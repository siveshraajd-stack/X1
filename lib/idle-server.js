import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { IDLE_MAX_EPISODE_MS, IDLE_THRESHOLD_MINUTES } from '@/lib/constants';
import { dayKey, dayStart } from '@/lib/dates';
import { computeIdle, exclusionsForDay } from '@/lib/idle';
import { getMeetingsForDay } from '@/lib/teams-calendar';
import { recordSpan } from '@/lib/work-hours';

// Cursor inactivity for the EMPLOYEE dashboard only (other roles never use this).

function assertEmployee(user) {
    if (user.role !== 'EMPLOYEE') throw new AppError('Inactivity tracking is only for employees', 403);
}

async function todayRecord(userId, now) {
    return prisma.attendance.findUnique({ where: { userId_date: { userId, date: dayStart(now) } } });
}

async function todayIdleSeconds(userId, now) {
    const sum = await prisma.idleEpisode.aggregate({
        where: { userId, date: dayStart(now) },
        _sum: { idleSeconds: true },
    });
    return sum._sum.idleSeconds || 0;
}

function describe(exclusions) {
    return exclusions.map((i) => ({ label: i.label, start: new Date(i.start).toISOString(), end: new Date(i.end).toISOString() }));
}

/** What the dashboard needs: is tracking on, today's breaks + meetings, and today's idle total. */
export async function getIdleState(user, now = new Date()) {
    if (user.role !== 'EMPLOYEE') return { enabled: false };
    const key = dayKey(now);
    const [record, teams, idleSeconds] = await Promise.all([
        todayRecord(user.id, now),
        getMeetingsForDay(user.email, key, { now: now.getTime() }),
        todayIdleSeconds(user.id, now),
    ]);
    const { inTime, outTime } = recordSpan(record);
    return {
        enabled: true,
        working: Boolean(inTime && !outTime), // clocked in and not clocked out yet
        thresholdMinutes: IDLE_THRESHOLD_MINUTES,
        exclusions: describe(exclusionsForDay(key, teams.meetings)),
        teams: { configured: teams.configured, ok: teams.ok },
        idleSeconds,
        idleMinutes: Math.floor(idleSeconds / 60),
    };
}

/**
 * Store one no-cursor-movement report: { startedAt (last movement), endedAt (now, or the next movement) }.
 * The server recalculates everything itself (clock-in/out window, breaks, lunch, Teams meetings), so
 * the browser only says WHEN the cursor was still. Safe to send again and again (one row per episode).
 */
export async function recordIdleEpisode(user, { startedAt, endedAt }, now = new Date()) {
    assertEmployee(user);
    const startMs = new Date(startedAt).getTime();
    const reportedEnd = new Date(endedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(reportedEnd)) throw new AppError('startedAt and endedAt must be valid times', 400);
    const endMs = Math.min(reportedEnd, now.getTime()); // never trust a time from the future
    if (!(endMs > startMs)) throw new AppError('endedAt must be after startedAt', 400);
    if (endMs - startMs > IDLE_MAX_EPISODE_MS) throw new AppError('That inactivity period is too long to be valid', 400);

    const key = dayKey(now);
    const dayStartMs = dayStart(now).getTime();
    const record = await todayRecord(user.id, now);
    const { inTime, outTime } = recordSpan(record);
    if (!inTime) return { counted: false, reason: 'Not clocked in', idleSeconds: await todayIdleSeconds(user.id, now) };

    const teams = await getMeetingsForDay(user.email, key, { now: now.getTime() });
    const result = computeIdle({
        startedAt: Math.max(startMs, dayStartMs), // only today counts
        endedAt: endMs,
        exclusions: exclusionsForDay(key, teams.meetings),
        workStart: new Date(inTime).getTime(),
        workEnd: outTime ? new Date(outTime).getTime() : null,
    });
    if (!result.triggered) {
        return { counted: false, reason: 'Under the threshold', idleSeconds: await todayIdleSeconds(user.id, now) };
    }

    const idleSeconds = Math.floor(result.idleMs / 1000);
    const startedDate = new Date(startMs);
    let episode = await prisma.idleEpisode.findUnique({ where: { userId_startedAt: { userId: user.id, startedAt: startedDate } } });
    if (!episode) {
        try {
            episode = await prisma.idleEpisode.create({
                data: { userId: user.id, date: dayStart(now), startedAt: startedDate, endedAt: new Date(endMs), idleSeconds },
            });
        } catch (error) {
            if (error.code !== 'P2002') throw error;
            episode = await prisma.idleEpisode.findUnique({ where: { userId_startedAt: { userId: user.id, startedAt: startedDate } } });
        }
    }
    if (episode && new Date(episode.endedAt).getTime() < endMs) {
        episode = await prisma.idleEpisode.update({ where: { id: episode.id }, data: { endedAt: new Date(endMs), idleSeconds } });
    }

    // The 5-minute alert: exactly once per episode (the claim below can only succeed once)
    let notified = false;
    if (episode && !episode.notifiedAt) {
        const claim = await prisma.idleEpisode.updateMany({ where: { id: episode.id, notifiedAt: null }, data: { notifiedAt: now } });
        if (claim.count === 1) {
            await prisma.notification.create({
                data: {
                    userId: user.id,
                    type: 'IDLE_ALERT',
                    title: 'No cursor movement',
                    message: `Your cursor has not moved for ${IDLE_THRESHOLD_MINUTES} minutes. Idle minutes are being counted until you move it.`,
                    priority: 'HIGH',
                    actionUrl: '/dashboard',
                },
            });
            notified = true;
        }
    }

    const total = await todayIdleSeconds(user.id, now);
    return { counted: true, notified, idleSeconds: total, idleMinutes: Math.floor(total / 60) };
}
