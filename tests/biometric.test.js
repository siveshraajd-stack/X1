/** @jest-environment node */

const db = { users: [], punches: [], attendance: [], leaves: [], holidays: [], overrides: [], notifications: [] };
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();
let seq = 0;

jest.mock('@/lib/db', () => ({
    prisma: {
        user: { findMany: async ({ where }) => db.users.filter((u) => u.companyId === where.companyId && where.biometricId.in.includes(u.biometricId)) },
        biometricPunch: {
            createMany: async ({ data }) => {
                let count = 0;
                for (const row of data) {
                    if (db.punches.some((p) => p.biometricId === row.biometricId && same(p.punchTime, row.punchTime))) continue;
                    db.punches.push({ id: `p${++seq}`, ...row });
                    count++;
                }
                return { count };
            },
            findMany: async ({ where }) =>
                db.punches.filter((p) => {
                    if (where.status && p.status !== where.status) return false;
                    if (where.userId && p.userId !== where.userId) return false;
                    if (where.biometricId && p.biometricId !== where.biometricId) return false;
                    if (where.punchTime && !(p.punchTime >= where.punchTime.gte && p.punchTime < where.punchTime.lt)) return false;
                    return true;
                }),
            deleteMany: async ({ where }) => {
                db.punches = db.punches.filter((p) => !where.id.in.includes(p.id));
            },
        },
        holiday: { findUnique: async ({ where }) => db.holidays.find((h) => same(h.date, where.companyId_date.date)) || null },
        attendanceOverride: { findUnique: async ({ where }) => db.overrides.find((o) => same(o.date, where.companyId_date.date)) || null },
        attendance: {
            findUnique: async ({ where }) => db.attendance.find((a) => a.userId === where.userId_date.userId && same(a.date, where.userId_date.date)) || null,
            upsert: async ({ where, create, update }) => {
                const row = db.attendance.find((a) => a.userId === where.userId_date.userId && same(a.date, where.userId_date.date));
                if (row) return Object.assign(row, update);
                const created = { id: `a${++seq}`, ...create };
                db.attendance.push(created);
                return created;
            },
            count: async ({ where }) => db.attendance.filter((a) => a.userId === where.userId && a.status === where.status && a.date >= where.date.gte && a.date < where.date.lt).length,
        },
        leaveRequest: {
            findFirst: async ({ where }) => db.leaves.find((l) => l.userId === where.userId && l.status === 'APPROVED' && l.startDate <= where.startDate.lte && l.endDate >= where.endDate.gte) || null,
            findUnique: async ({ where }) => db.leaves.find((l) => l.lateKey === where.lateKey) || null,
            findMany: async ({ where }) => db.leaves.filter((l) => l.userId === where.userId && l.status === 'APPROVED' && where.type.in.includes(l.type)),
            create: async ({ data }) => {
                const row = { id: `l${++seq}`, ...data };
                db.leaves.push(row);
                return row;
            },
        },
        notification: { create: async ({ data }) => db.notifications.push(data) },
    },
}));

import { normalizePunch, parsePunchTime, processPunches, reprocessUnmapped, verifyApiKey } from '@/lib/biometric';
import { dayStart } from '@/lib/dates';

const NOW = new Date('2026-11-19T20:00:00+05:30');
const fmtIST = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(11, 16);

beforeEach(() => {
    Object.assign(db, { users: [{ id: 'u1', name: 'Asha', companyId: 'c1', managerId: 'm1', biometricId: '101' }], punches: [], attendance: [], leaves: [], holidays: [], overrides: [], notifications: [] });
});

describe('punch parsing', () => {
    it('treats zone-less times as India time and understands common formats', () => {
        expect(parsePunchTime('2026-11-18 09:05:30').toISOString()).toBe('2026-11-18T03:35:30.000Z');
        expect(parsePunchTime('18/11/2026 09:05').toISOString()).toBe('2026-11-18T03:35:00.000Z');
        expect(parsePunchTime('2026-11-18T09:05:00+05:30').toISOString()).toBe('2026-11-18T03:35:00.000Z');
        expect(parsePunchTime('2026-11-18T03:35:00Z').toISOString()).toBe('2026-11-18T03:35:00.000Z');
        expect(parsePunchTime(1795055100).toISOString()).toBe(new Date(1795055100 * 1000).toISOString());
        expect(parsePunchTime('09:05:00', '2026-11-18').toISOString()).toBe('2026-11-18T03:35:00.000Z');
    });
    it('rejects garbage and impossible dates', () => {
        expect(parsePunchTime('yesterday')).toBeNull();
        expect(parsePunchTime('2026-02-31 09:00:00')).toBeNull();
    });
    it('maps vendor field names', () => {
        expect(normalizePunch({ emp_code: 101, punch_time: '2026-11-18 09:05:00', terminal_sn: 'SN1' })).toMatchObject({ biometricId: '101', deviceId: 'SN1' });
        expect(normalizePunch({ userId: '7' }).error).toMatch(/time/);
        expect(normalizePunch({ timestamp: '2026-11-18 09:05:00' }).error).toMatch(/id/);
    });
});

describe('api key', () => {
    it('is constant-time compared and requires a configured key', () => {
        delete process.env.BIOMETRIC_API_KEY;
        expect(() => verifyApiKey('x')).toThrow(/not configured/);
        process.env.BIOMETRIC_API_KEY = 'a-very-long-secret-key-123';
        expect(verifyApiKey('a-very-long-secret-key-123')).toBe(true);
        expect(verifyApiKey('wrong')).toBe(false);
        expect(verifyApiKey(undefined)).toBe(false);
    });
});

describe('punches -> attendance', () => {
    it('first punch is check-in, last is check-out, on time = PRESENT', async () => {
        const s = await processPunches('c1', [
            { biometricId: '101', timestamp: '2026-11-18 08:55:00' },
            { biometricId: '101', timestamp: '2026-11-18 13:00:00' },
            { biometricId: '101', timestamp: '2026-11-18 17:35:00' },
        ], NOW);
        expect(s).toMatchObject({ applied: 3, unmapped: 0, ignored: 0 });
        const rec = db.attendance[0];
        expect(rec.status).toBe('PRESENT');
        expect(fmtIST(rec.checkIn)).toBe('08:55');
        expect(fmtIST(rec.checkOut)).toBe('17:35');
    });

    it('after 9:00 is LATE; a double scan is not a check-out; re-sending changes nothing', async () => {
        const punches = [{ biometricId: '101', timestamp: '2026-11-18 09:20:00' }, { biometricId: '101', timestamp: '2026-11-18 09:22:00' }];
        await processPunches('c1', punches, NOW);
        expect(db.attendance[0].status).toBe('LATE');
        expect(db.attendance[0].checkOut).toBeNull();
        const again = await processPunches('c1', punches, NOW);
        expect(again.duplicates).toBe(2);
        expect(db.attendance).toHaveLength(1);
        expect(db.punches).toHaveLength(2);
    });

    it('a later batch with the evening punch completes the day', async () => {
        await processPunches('c1', [{ biometricId: '101', timestamp: '2026-11-18 08:50:00' }], NOW);
        await processPunches('c1', [{ biometricId: '101', timestamp: '2026-11-18 17:40:00' }], NOW);
        expect(fmtIST(db.attendance[0].checkOut)).toBe('17:40');
        expect(db.attendance[0].status).toBe('PRESENT');
    });

    it('5th late punch-in of the month deducts a leave day', async () => {
        for (const d of ['02', '03', '04', '05', '06']) await processPunches('c1', [{ biometricId: '101', timestamp: `2026-11-${d} 09:30:00` }], NOW);
        const auto = db.leaves.filter((l) => l.autoGenerated);
        expect(auto).toHaveLength(1);
        expect(auto[0]).toMatchObject({ type: 'CASUAL', days: 1, lateKey: 'u1:2026-11:1' });
        expect(db.notifications[0].message).toContain('5 late marks');
    });

    it('keeps WFH / On Duty chosen by the employee but records the times', async () => {
        db.attendance.push({ id: 'x', userId: 'u1', date: dayStart('2026-11-18'), status: 'OD' });
        await processPunches('c1', [{ biometricId: '101', timestamp: '2026-11-18 10:30:00' }], NOW);
        expect(db.attendance[0].status).toBe('OD');
        expect(fmtIST(db.attendance[0].checkIn)).toBe('10:30');
    });

    it('ignores punches on holidays, weekends (unless allowed) and approved-leave days', async () => {
        db.holidays.push({ date: dayStart('2026-11-18'), name: 'Fest' });
        const s = await processPunches('c1', [
            { biometricId: '101', timestamp: '2026-11-18 09:00:00' },
            { biometricId: '101', timestamp: '2026-11-14 09:00:00' },
        ], NOW);
        expect(s.ignored).toBe(2);
        expect(db.attendance).toHaveLength(0);
        db.overrides.push({ date: dayStart('2026-11-14') });
        db.leaves.push({ userId: 'u1', status: 'APPROVED', type: 'SICK', days: 1, startDate: dayStart('2026-11-17'), endDate: dayStart('2026-11-17') });
        const s2 = await processPunches('c1', [{ biometricId: '101', timestamp: '2026-11-14 08:45:00' }, { biometricId: '101', timestamp: '2026-11-17 08:45:00' }], NOW);
        expect(s2).toMatchObject({ applied: 1, ignored: 1 });
        expect(db.attendance).toHaveLength(1);
    });

    it('rejects future / unreadable punches; unknown ids are kept and applied after mapping', async () => {
        const s = await processPunches('c1', [
            { biometricId: '101', timestamp: '2026-12-25 09:00:00' },
            { biometricId: '101' },
            { biometricId: '555', timestamp: '2026-11-18 08:58:00' },
        ], NOW);
        expect(s.rejected).toHaveLength(2);
        expect(s.unmapped).toBe(1);
        expect(db.attendance).toHaveLength(0);

        db.users.push({ id: 'u2', name: 'Ravi', companyId: 'c1', managerId: 'm1', biometricId: '555' });
        const r = await reprocessUnmapped('c1', '555');
        expect(r.applied).toBe(1);
        expect(db.attendance.find((a) => a.userId === 'u2').status).toBe('PRESENT');
        expect(db.punches.filter((p) => p.biometricId === '555')).toHaveLength(1);
    });
});
