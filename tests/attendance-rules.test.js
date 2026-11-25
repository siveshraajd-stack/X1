/** @jest-environment node */

// In-memory stand-in for Prisma so the real business rules can be exercised.
const db = { attendance: [], leaves: [], holidays: [], overrides: [], notifications: [] };
const sameDate = (a, b) => new Date(a).getTime() === new Date(b).getTime();
let seq = 0;

jest.mock('@/lib/db', () => ({
    prisma: {
        holiday: { findUnique: async ({ where }) => db.holidays.find((h) => sameDate(h.date, where.companyId_date.date)) || null },
        attendanceOverride: { findUnique: async ({ where }) => db.overrides.find((o) => sameDate(o.date, where.companyId_date.date)) || null },
        attendance: {
            findUnique: async ({ where }) =>
                db.attendance.find((a) => a.userId === where.userId_date.userId && sameDate(a.date, where.userId_date.date)) || null,
            upsert: async ({ where, create, update }) => {
                const row = db.attendance.find((a) => a.userId === where.userId_date.userId && sameDate(a.date, where.userId_date.date));
                if (row) return Object.assign(row, update);
                const created = { id: `a${++seq}`, ...create };
                db.attendance.push(created);
                return created;
            },
            count: async ({ where }) =>
                db.attendance.filter(
                    (a) => a.userId === where.userId && a.status === where.status && a.date >= where.date.gte && a.date < where.date.lt
                ).length,
        },
        leaveRequest: {
            findFirst: async ({ where }) =>
                db.leaves.find(
                    (l) => l.userId === where.userId && l.status === 'APPROVED' && l.startDate <= where.startDate.lte && l.endDate >= where.endDate.gte
                ) || null,
            findUnique: async ({ where }) => db.leaves.find((l) => l.lateKey === where.lateKey) || null,
            findMany: async ({ where }) =>
                db.leaves.filter(
                    (l) =>
                        l.userId === where.userId &&
                        l.status === 'APPROVED' &&
                        where.type.in.includes(l.type) &&
                        l.startDate >= where.startDate.gte &&
                        l.startDate < where.startDate.lt
                ),
            create: async ({ data }) => {
                if (data.lateKey && db.leaves.some((l) => l.lateKey === data.lateKey)) {
                    const err = new Error('unique');
                    err.code = 'P2002';
                    throw err;
                }
                const row = { id: `l${++seq}`, ...data };
                db.leaves.push(row);
                return row;
            },
        },
        notification: { create: async ({ data }) => db.notifications.push(data) },
    },
}));

import { markAttendance, buildMonthDays, lateProgress } from '@/lib/attendance-core';
import { dayStart } from '@/lib/dates';

const user = { id: 'u1', name: 'Test', companyId: 'c1', managerId: 'm1' };
const at = (key, time) => new Date(`${key}T${time}+05:30`);

beforeEach(() => {
    db.attendance = [];
    db.leaves = [];
    db.holidays = [];
    db.overrides = [];
    db.notifications = [];
});

describe('marking attendance', () => {
    it('present before 9:00 stays PRESENT, after 9:00 becomes LATE automatically', async () => {
        const ok = await markAttendance({ user, status: 'PRESENT', now: at('2026-11-18', '08:45:00') });
        expect(ok.status).toBe('PRESENT');
        const late = await markAttendance({ user, status: 'PRESENT', now: at('2026-11-19', '09:20:00') });
        expect(late.status).toBe('LATE');
        expect(late.notice).toMatch(/9:00 AM/);
    });

    it('lateness is judged by the first mark of the day, not by a later edit', async () => {
        await markAttendance({ user, status: 'PRESENT', now: at('2026-11-18', '08:50:00') });
        const edited = await markAttendance({ user, status: 'WFH', now: at('2026-11-18', '15:00:00') });
        expect(edited.status).toBe('WFH');
    });

    it('On Duty is never auto-late; explicit LATE and ABSENT are kept', async () => {
        expect((await markAttendance({ user, status: 'OD', now: at('2026-11-18', '11:00:00') })).status).toBe('OD');
        expect((await markAttendance({ user, status: 'ABSENT', now: at('2026-11-19', '11:00:00') })).status).toBe('ABSENT');
        expect((await markAttendance({ user, status: 'LATE', now: at('2026-11-17', '08:00:00') })).status).toBe('LATE');
    });

    it('5th late mark in a month deducts 1 day (CASUAL while balance exists) and tells the employee', async () => {
        const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
        for (const d of days) {
            const r = await markAttendance({ user, status: 'PRESENT', now: at(d, '09:30:00') });
            expect(r.deductions).toHaveLength(0);
        }
        const fifth = await markAttendance({ user, status: 'PRESENT', now: at('2026-11-06', '09:30:00') });
        expect(fifth.lateCount).toBe(5);
        expect(fifth.deductions).toHaveLength(1);
        expect(fifth.notice).toContain('You have reached 5 late marks this month. 1 day leave has been deducted.');
        expect(db.leaves).toHaveLength(1);
        expect(db.leaves[0]).toMatchObject({ type: 'CASUAL', days: 1, status: 'APPROVED', autoGenerated: true, userId: 'u1' });
        expect(dayStart('2026-11-06').getTime()).toBe(db.leaves[0].startDate.getTime());
        expect(db.notifications).toHaveLength(1);
    });

    it('becomes LOP when no leave balance is left, and repeats at 10 late marks', async () => {
        db.leaves.push({ userId: 'u1', status: 'APPROVED', type: 'CASUAL', days: 8, startDate: dayStart('2026-03-02'), endDate: dayStart('2026-03-13') });
        const days = ['02', '03', '04', '05', '06', '09', '10', '11', '12', '13'];
        let last;
        for (const d of days) last = await markAttendance({ user, status: 'PRESENT', now: at(`2026-11-${d}`, '09:30:00') });
        const auto = db.leaves.filter((l) => l.autoGenerated);
        expect(auto.map((l) => l.type)).toEqual(['LOP', 'LOP']);
        expect(auto.map((l) => l.lateKey)).toEqual(['u1:2026-11:1', 'u1:2026-11:2']);
        expect(last.notice).toContain('10 late marks');
        expect(last.notice).toContain('LOP');
    });

    it('never deducts the same block twice', async () => {
        for (const d of ['02', '03', '04', '05', '06']) await markAttendance({ user, status: 'PRESENT', now: at(`2026-11-${d}`, '09:30:00') });
        // editing the same day is blocked (late is locked) so the count cannot be replayed
        await expect(markAttendance({ user, status: 'PRESENT', now: at('2026-11-06', '09:40:00') })).rejects.toThrow(/late mark/i);
        expect(db.leaves.filter((l) => l.autoGenerated)).toHaveLength(1);
    });

    it('late count resets each month', async () => {
        for (const d of ['02', '03', '04', '05']) await markAttendance({ user, status: 'PRESENT', now: at(`2026-11-${d}`, '09:30:00') });
        const dec = await markAttendance({ user, status: 'PRESENT', now: at('2026-12-01', '09:30:00') });
        expect(dec.lateCount).toBe(1);
        expect(dec.deductions).toHaveLength(0);
    });

    it('blocks weekends and festival holidays unless the admin allows the date', async () => {
        await expect(markAttendance({ user, status: 'PRESENT', now: at('2026-11-21', '08:30:00') })).rejects.toThrow(/weekend/i);
        db.holidays.push({ date: dayStart('2026-11-18'), name: 'Test Festival' });
        await expect(markAttendance({ user, status: 'PRESENT', now: at('2026-11-18', '08:30:00') })).rejects.toThrow(/Test Festival/);
        db.overrides.push({ date: dayStart('2026-11-18') });
        db.overrides.push({ date: dayStart('2026-11-21') });
        expect((await markAttendance({ user, status: 'PRESENT', now: at('2026-11-18', '08:30:00') })).status).toBe('PRESENT');
        expect((await markAttendance({ user, status: 'PRESENT', now: at('2026-11-21', '08:30:00') })).status).toBe('PRESENT');
    });

    it('rejects future days, bad statuses, old months and days with approved leave', async () => {
        const now = at('2026-11-18', '08:30:00');
        await expect(markAttendance({ user, status: 'PRESENT', targetKey: '2026-11-19', now })).rejects.toThrow(/future/i);
        await expect(markAttendance({ user, status: 'SLEEPING', now })).rejects.toThrow(/Status must be/);
        await expect(markAttendance({ user, status: 'PRESENT', targetKey: '2026-10-30', now })).rejects.toThrow(/current month/);
        db.leaves.push({ userId: 'u1', status: 'APPROVED', type: 'SICK', days: 1, startDate: dayStart('2026-11-18'), endDate: dayStart('2026-11-18') });
        await expect(markAttendance({ user, status: 'PRESENT', now })).rejects.toThrow(/approved leave/);
    });

    it('past days of this month can be filled once, without becoming late', async () => {
        const now = at('2026-11-18', '15:00:00');
        const r = await markAttendance({ user, status: 'PRESENT', targetKey: '2026-11-17', now });
        expect(r.status).toBe('PRESENT');
        await expect(markAttendance({ user, status: 'WFH', targetKey: '2026-11-17', now })).rejects.toThrow(/already marked/i);
    });
});

describe('calendar building', () => {
    const base = { year: 2026, month: 11, leaves: [], overrides: new Set(), trackingStart: '2026-11-01', now: at('2026-11-18', '12:00:00') };

    it('colors: holiday, weekend, absent, pending, upcoming, leave', () => {
        const { days, summary } = buildMonthDays({
            ...base,
            records: [{ date: dayStart('2026-11-16'), status: 'LATE', checkIn: at('2026-11-16', '09:30:00') }],
            holidays: new Map([['2026-11-17', 'Festival']]),
            leaves: [{ startDate: dayStart('2026-11-12'), endDate: dayStart('2026-11-12'), type: 'SICK' }],
        });
        const by = Object.fromEntries(days.map((d) => [d.date, d.status]));
        expect(by['2026-11-16']).toBe('LATE');
        expect(by['2026-11-17']).toBe('HOLIDAY');
        expect(by['2026-11-14']).toBe('WEEKEND');
        expect(by['2026-11-12']).toBe('ON_LEAVE');
        expect(by['2026-11-13']).toBe('ABSENT');
        expect(by['2026-11-18']).toBe('PENDING');
        expect(by['2026-11-25']).toBe('OUTSIDE');
        expect(summary.LATE).toBe(1);
    });

    it('future holidays and weekends keep their colors', () => {
        const { days } = buildMonthDays({ ...base, records: [], holidays: new Map([['2026-11-25', 'Future Fest']]) });
        const by = Object.fromEntries(days.map((d) => [d.date, d.status]));
        expect(by['2026-11-25']).toBe('HOLIDAY');
        expect(by['2026-11-28']).toBe('WEEKEND');
    });

    it('late progress shows X/5', () => {
        expect(lateProgress(0).inBlock).toBe(0);
        expect(lateProgress(3).inBlock).toBe(3);
        expect(lateProgress(5).inBlock).toBe(5);
        expect(lateProgress(6).inBlock).toBe(1);
        expect(lateProgress(10).deductedDays).toBe(2);
    });
});
