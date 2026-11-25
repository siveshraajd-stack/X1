import { prisma } from '@/lib/db';
import { getTeamIds } from '@/lib/team';
import { decisionStageFor } from '@/lib/leave';
import { getNonWorkingBlock } from '@/lib/attendance-core';
import { addDaysToKey, dayKey, dayStart, weekdayOfKey } from '@/lib/dates';
import { computeHourTotals, hoursQueryRange } from '@/lib/work-hours';
import { WEEKEND_DAYS, isNonLeaveType } from '@/lib/constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = 14;
const LIST_LIMIT = 6;

// Status of one person today. OD and WFH are their own states (never counted as present / absent).
function statusOf({ record, onLeave, offDay }) {
    const st = String(record?.status || '').toUpperCase();
    if (st === 'OD') return 'OD';
    if (st === 'WFH') return 'WFH';
    if (record && (record.checkIn || record.clockIn)) return st === 'LATE' ? 'LATE' : 'PRESENT';
    if (onLeave) return 'LEAVE';
    if (offDay) return 'OFF';
    return 'ABSENT';
}

const isHere = (status) => ['PRESENT', 'LATE', 'WFH', 'OD'].includes(status);

/**
 * Everything the Manager and Team Lead dashboards show, in one call.
 * `user` must be a MANAGER or TEAM_LEAD (checked by the route).
 */
export async function buildTeamOverview(user) {
    const now = new Date();
    const todayKey = dayKey(now);
    const start = dayStart(todayKey);
    const end = new Date(start.getTime() + DAY_MS - 1);
    const upcomingEnd = dayStart(addDaysToKey(todayKey, UPCOMING_DAYS));

    const ids = await getTeamIds(user);
    const people = ids.length
        ? await prisma.user.findMany({
              where: { id: { in: ids }, companyId: user.companyId },
              select: {
                  id: true,
                  name: true,
                  employeeId: true,
                  role: true,
                  managerId: true,
                  jobDetails: { select: { jobPosition: true, department: true } },
              },
              orderBy: { name: 'asc' },
          })
        : [];
    const memberIds = people.map((p) => p.id);

    // Last 7 working days for the trend bars
    const trendKeys = [];
    for (let back = 0; trendKeys.length < 7 && back < 21; back += 1) {
        const key = addDaysToKey(todayKey, -back);
        if (!WEEKEND_DAYS.includes(weekdayOfKey(key))) trendKeys.unshift(key);
    }
    const trendStart = dayStart(trendKeys[0]);
    const { start: hoursStart, end: hoursEnd } = hoursQueryRange(now);
    // One attendance query covers today, the trend bars and this week's hours
    const rangeStart = new Date(Math.min(trendStart.getTime(), hoursStart.getTime()));
    const rangeEnd = new Date(Math.max(hoursEnd.getTime(), end.getTime() + 1));

    const [recordsForRange, leavesToday, upcoming, waitingLeaves, waitingExpenses, holidays, block] = await Promise.all([
        prisma.attendance.findMany({ where: { userId: { in: memberIds }, date: { gte: rangeStart, lt: rangeEnd } } }),
        prisma.leaveRequest.findMany({
            where: { userId: { in: memberIds }, status: 'APPROVED', startDate: { lte: end }, endDate: { gte: start } },
            select: { userId: true, type: true },
        }),
        prisma.leaveRequest.findMany({
            where: { userId: { in: memberIds }, status: 'APPROVED', startDate: { lt: upcomingEnd }, endDate: { gte: start } },
            select: { id: true, userId: true, type: true, startDate: true, endDate: true, days: true },
            orderBy: { startDate: 'asc' },
            take: 40,
        }),
        prisma.leaveRequest.findMany({
            where: {
                status: { in: ['PENDING', 'TEAM_LEAD_APPROVED'] },
                OR: [{ managerId: user.id }, { upperManagerId: user.id }],
                userId: { not: user.id },
                user: { companyId: user.companyId },
            },
            include: { user: { select: { id: true, name: true, employeeId: true } } },
            orderBy: { createdAt: 'asc' },
        }),
        // Team leads do not handle expense claims (they go to the manager / HR)
        user.role === 'TEAM_LEAD'
            ? Promise.resolve([])
            : prisma.expenseClaim.findMany({
                  where: { status: 'PENDING', managerId: user.id, userId: { not: user.id }, user: { companyId: user.companyId } },
                  include: { user: { select: { id: true, name: true, employeeId: true } } },
                  orderBy: { createdAt: 'asc' },
              }),
        prisma.holiday.findMany({
            where: { companyId: user.companyId, date: { gte: start } },
            orderBy: { date: 'asc' },
            take: 3,
            select: { id: true, name: true, date: true },
        }),
        getNonWorkingBlock(user.companyId, todayKey),
    ]);

    // ---- today's roster -------------------------------------------------------------------
    const todaysRecords = recordsForRange.filter((r) => dayKey(r.date) === todayKey);
    const recordOf = new Map(todaysRecords.map((r) => [r.userId, r]));
    const leaveIds = new Set(leavesToday.filter((l) => !isNonLeaveType(l.type)).map((l) => l.userId));
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const idOf = new Map(people.map((p) => [p.id, p.employeeId]));

    const weekMinutesOf = new Map();
    for (const person of people) {
        const mine = recordsForRange.filter((r) => r.userId === person.id);
        weekMinutesOf.set(person.id, computeHourTotals(mine, now).weekMinutes);
    }

    const roster = people.map((p) => {
        const record = recordOf.get(p.id);
        const status = statusOf({ record, onLeave: leaveIds.has(p.id), offDay: !!block });
        return {
            id: p.id,
            name: p.name,
            employeeId: p.employeeId,
            role: p.role,
            managerId: p.managerId,
            position: p.jobDetails?.jobPosition || null,
            department: p.jobDetails?.department || null,
            status,
            checkIn: record?.checkIn || record?.clockIn || null,
            weekMinutes: weekMinutesOf.get(p.id) || 0,
        };
    });

    const count = (status) => roster.filter((r) => r.status === status).length;
    const today = {
        total: roster.length,
        present: count('PRESENT') + count('LATE'),
        late: count('LATE'),
        wfh: count('WFH'),
        od: count('OD'),
        leave: count('LEAVE'),
        absent: count('ABSENT'),
        offDayReason: block,
        here: roster.filter((r) => isHere(r.status)).length,
    };

    // ---- approvals waiting for this person ---------------------------------------------------
    const leaveQueue = waitingLeaves.filter((l) => decisionStageFor(l, user) !== null);
    const pending = {
        leaves: leaveQueue.length,
        expenses: waitingExpenses.length,
        leaveItems: leaveQueue.slice(0, LIST_LIMIT).map((l) => ({
            id: l.id,
            type: l.type,
            startDate: l.startDate,
            endDate: l.endDate,
            days: l.days,
            reason: l.reason,
            stage: decisionStageFor(l, user),
            user: l.user,
        })),
        expenseItems: waitingExpenses.slice(0, LIST_LIMIT).map((c) => ({
            id: c.id,
            category: c.category,
            amount: c.amount,
            projectName: c.projectName,
            fromDate: c.fromDate,
            toDate: c.toDate,
            user: c.user,
        })),
    };

    // ---- who is away in the next two weeks -----------------------------------------------------
    const upcomingLeaves = upcoming.slice(0, 12).map((l) => ({
        id: l.id,
        name: nameOf.get(l.userId) || '',
        employeeId: idOf.get(l.userId) || '',
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
        days: l.days,
    }));

    // ---- last 7 working days: how many people were in --------------------------------------
    const trend = trendKeys.map((key) => {
        const attended = new Set();
        for (const r of recordsForRange) {
            if (dayKey(r.date) !== key) continue;
            const st = String(r.status || '').toUpperCase();
            if (r.checkIn || r.clockIn || st === 'OD' || st === 'WFH') attended.add(r.userId);
        }
        return { key, attended: attended.size, isToday: key === todayKey };
    });

    const weekMinutes = roster.reduce((sum, r) => sum + r.weekMinutes, 0);

    const overview = {
        role: user.role,
        today,
        roster,
        pending,
        upcomingLeaves,
        holidays: holidays.map((h) => ({ id: h.id, name: h.name, date: h.date })),
        trend,
        weekMinutes,
    };

    // ---- manager only: team leads and departments ---------------------------------------------
    if (user.role === 'MANAGER') {
        const statusById = new Map(roster.map((r) => [r.id, r.status]));
        const waitingByLead = new Map();
        const leadWaiting = await prisma.leaveRequest.findMany({
            where: { status: 'PENDING', managerId: { in: people.filter((p) => p.role === 'TEAM_LEAD').map((p) => p.id) } },
            select: { managerId: true },
        });
        for (const w of leadWaiting) waitingByLead.set(w.managerId, (waitingByLead.get(w.managerId) || 0) + 1);

        overview.teamLeads = people
            .filter((p) => p.role === 'TEAM_LEAD')
            .map((lead) => {
                const reports = people.filter((p) => p.managerId === lead.id);
                return {
                    id: lead.id,
                    name: lead.name,
                    employeeId: lead.employeeId,
                    status: statusById.get(lead.id),
                    teamSize: reports.length,
                    here: reports.filter((r) => isHere(statusById.get(r.id))).length,
                    onLeave: reports.filter((r) => statusById.get(r.id) === 'LEAVE').length,
                    waitingWithLead: waitingByLead.get(lead.id) || 0,
                };
            });

        const byDept = new Map();
        for (const r of roster) {
            const name = r.department || 'No department';
            const row = byDept.get(name) || { name, total: 0, here: 0 };
            row.total += 1;
            if (isHere(r.status)) row.here += 1;
            byDept.set(name, row);
        }
        overview.departments = [...byDept.values()].sort((a, b) => b.total - a.total);
    }

    return overview;
}
