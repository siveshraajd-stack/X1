/** @jest-environment node */

// 2 paid leave days a month (Sick + Casual together); extra days become LOP.
const db = { leaves: [], holidays: [] };

jest.mock('@/lib/db', () => ({
    prisma: {
        holiday: { findMany: async () => db.holidays },
        leaveRequest: { findMany: async ({ where }) => db.leaves.filter((l) => l.userId === where.userId) },
    },
}));
jest.mock('@/lib/mailer', () => ({
    appBaseUrl: () => 'http://localhost',
    escapeHtml: (v) => String(v ?? ''),
    sendMail: async () => ({ sent: true }),
}));

const { planLeaveSegments } = require('@/lib/leave');
const { DEFAULT_TEMP_PASSWORD } = require('@/lib/constants');

const at = (key) => new Date(`${key}T00:00:00+05:30`);
const plan = (extra) => planLeaveSegments({ userId: 'u1', companyId: 'c1', type: 'SICK', ...extra });
const text = (segments) => segments.map((s) => `${s.type} ${s.startKey}..${s.endKey} (${s.days})`);

beforeEach(() => {
    db.leaves = [];
    db.holidays = [];
});

test('first 2 working days of the month are paid, the rest are LOP', async () => {
    const segments = await plan({ startKey: '2026-11-09', endKey: '2026-11-13' });
    expect(text(segments)).toEqual(['SICK 2026-11-09..2026-11-10 (2)', 'LOP 2026-11-11..2026-11-13 (3)']);
});

test('days already used or waiting in the month count against the limit', async () => {
    db.leaves = [{ userId: 'u1', id: 'a', startDate: at('2026-11-03'), endDate: at('2026-11-03') }];
    const segments = await plan({ type: 'CASUAL', startKey: '2026-11-09', endKey: '2026-11-11' });
    expect(text(segments)).toEqual(['CASUAL 2026-11-09..2026-11-09 (1)', 'LOP 2026-11-10..2026-11-11 (2)']);
});

test('each month has its own limit', async () => {
    db.leaves = [{ userId: 'u1', id: 'a', startDate: at('2026-11-03'), endDate: at('2026-11-03') }];
    const segments = await plan({ startKey: '2026-11-30', endKey: '2026-12-02' });
    expect(text(segments)).toEqual(['SICK 2026-11-30..2026-12-02 (3)']);
});

test('an empty yearly quota also turns the days into LOP', async () => {
    const segments = await plan({ startKey: '2026-12-07', endKey: '2026-12-08', yearlyAvailable: 0 });
    expect(text(segments)).toEqual(['LOP 2026-12-07..2026-12-08 (2)']);
});

test('other leave types are not split', async () => {
    const segments = await plan({ type: 'EARNED', startKey: '2026-12-07', endKey: '2026-12-11' });
    expect(text(segments)).toEqual(['EARNED 2026-12-07..2026-12-11 (5)']);
});

test('new accounts start with the same temporary password', () => {
    expect(DEFAULT_TEMP_PASSWORD).toBe('Keystone123@');
});
