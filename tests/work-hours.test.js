/** @jest-environment node */
import { workedMinutes, computeHourTotals, weekStartKey, formatMinutes, netWorkMs, mergeIntervals } from '@/lib/work-hours';
import { dayStart } from '@/lib/dates';
import { encryptSecret, decryptSecret } from '@/lib/password-vault';
import crypto from 'crypto';

// Thursday 19 Nov 2026, 15:00 IST
const NOW = new Date('2026-11-19T09:30:00Z');
const day = (key, inH, outH) => ({
    date: dayStart(key),
    clockIn: inH == null ? null : new Date(dayStart(key).getTime() + inH * 3600000),
    clockOut: outH == null ? null : new Date(dayStart(key).getTime() + outH * 3600000),
    checkIn: null,
    checkOut: null,
});

describe('work hours', () => {
    it('counts a complete day without the breaks and lunch (9:00-17:30 = 8.5h - 1.5h)', () => {
        expect(workedMinutes(day('2026-11-18', 9, 17.5), NOW)).toBe(420);
    });

    it('open past day counts 0, open today counts up to now (minus the breaks already passed)', () => {
        expect(workedMinutes(day('2026-11-17', 9, null), NOW)).toBe(0);
        // 9:00-15:00 = 360 min, minus 10:15-10:30 (15) and lunch (60); 3:30 has not started yet
        expect(workedMinutes(day('2026-11-19', 9, null), NOW)).toBe(285);
    });

    it('removes only the part of a break that was actually worked', () => {
        const at = (h, m) => new Date(dayStart('2026-11-18').getTime() + (h * 60 + m) * 60000);
        const rec = (a, b) => ({ date: dayStart('2026-11-18'), clockIn: at(...a), clockOut: at(...b), checkIn: null, checkOut: null });
        expect(workedMinutes(rec([10, 0], [10, 20]), NOW)).toBe(15); // 10:00-10:15 only
        expect(workedMinutes(rec([10, 20], [10, 40]), NOW)).toBe(10); // 10:30-10:40 only
        expect(workedMinutes(rec([10, 16], [10, 29]), NOW)).toBe(0); // fully inside the morning break
        expect(workedMinutes(rec([12, 50], [14, 10]), NOW)).toBe(20); // 12:50-13:00 + 14:00-14:10
        expect(workedMinutes(rec([15, 20], [15, 50]), NOW)).toBe(15); // 15:20-15:30 + 15:45-15:50
        expect(workedMinutes(rec([13, 0], [14, 0]), NOW)).toBe(0); // exactly lunch
    });

    it('prefers a complete biometric pair', () => {
        const r = { ...day('2026-11-18', 9, 10), checkIn: new Date(dayStart('2026-11-18').getTime() + 8 * 3600000), checkOut: new Date(dayStart('2026-11-18').getTime() + 18 * 3600000) };
        expect(workedMinutes(r, NOW)).toBe(510); // 8:00-18:00 = 600 - 90 min of breaks
    });

    it('week starts on Monday and totals are bucketed correctly', () => {
        expect(weekStartKey(NOW)).toBe('2026-11-16');
        const records = [
            day('2026-11-15', 9, 17), // Sunday of previous week: month only
            day('2026-11-16', 9, 17), // Monday
            day('2026-11-19', 9, null), // today, open (6h)
            day('2026-10-30', 9, 17), // previous month: ignored
        ];
        const t = computeHourTotals(records, NOW);
        // full 9-17 day = 480 - 90 = 390; today 9:00-15:00 open = 285
        expect(t.todayMinutes).toBe(285);
        expect(t.weekMinutes).toBe(390 + 285);
        expect(t.monthMinutes).toBe(390 + 390 + 285);
    });

    it('formats minutes', () => {
        expect(formatMinutes(485)).toBe('8h 05m');
        expect(formatMinutes(undefined)).toBe('0h 00m');
    });
});

describe('unpaid breaks', () => {
    it('netWorkMs removes 90 minutes from a full day and handles a span over two days', () => {
        const a = dayStart('2026-11-18').getTime();
        expect(netWorkMs(a + 9 * 3600000, a + 18 * 3600000)).toBe((9 * 60 - 90) * 60000);
        const b = dayStart('2026-11-19').getTime();
        // 18-Nov 17:00 -> 19-Nov 09:00 has no break time at all
        expect(netWorkMs(a + 17 * 3600000, b + 9 * 3600000)).toBe(16 * 3600000);
    });

    it('merges overlapping intervals', () => {
        expect(mergeIntervals([{ start: 5, end: 10 }, { start: 1, end: 6 }, { start: 20, end: 20 }, { start: 30, end: 40 }])).toEqual([
            { start: 1, end: 10 },
            { start: 30, end: 40 },
        ]);
    });
});

describe('password vault', () => {
    const key = crypto.createHash('sha256').update('test-secret').digest();
    it('round-trips and rejects a wrong key', () => {
        const enc = encryptSecret('Temp@1234', key);
        expect(enc).not.toContain('Temp@1234');
        expect(decryptSecret(enc, key)).toBe('Temp@1234');
        expect(decryptSecret(enc, crypto.createHash('sha256').update('other').digest())).toBeNull();
    });
});
