/** @jest-environment node */
import { dayKey, dayStart, normalizeDayKey, isAfterOfficeStart, monthRange, weekdayOfKey, eachDayKey, parseMonthKey } from '@/lib/dates';

describe('IST date helpers', () => {
    it('dayKey uses India time, not UTC', () => {
        // 2026-11-18 20:00 UTC is already 19 Nov 01:30 in IST
        expect(dayKey(new Date('2026-11-18T20:00:00Z'))).toBe('2026-11-19');
        expect(dayKey(new Date('2026-11-18T18:29:00Z'))).toBe('2026-11-18');
    });

    it('dayStart is midnight IST (18:30 UTC of the previous day)', () => {
        expect(dayStart('2026-11-19').toISOString()).toBe('2026-11-18T18:30:00.000Z');
        expect(dayKey(dayStart('2026-11-19'))).toBe('2026-11-19');
    });

    it('rejects impossible dates', () => {
        expect(normalizeDayKey('2026-02-30')).toBeNull();
        expect(normalizeDayKey('2026-13-01')).toBeNull();
        expect(normalizeDayKey('hello')).toBeNull();
        expect(normalizeDayKey('2026-11-19')).toBe('2026-11-19');
    });

    it('9:00:xx is on time, 9:01 is late', () => {
        expect(isAfterOfficeStart(new Date('2026-11-18T09:00:45+05:30'))).toBe(false);
        expect(isAfterOfficeStart(new Date('2026-11-18T08:59:00+05:30'))).toBe(false);
        expect(isAfterOfficeStart(new Date('2026-11-18T09:01:00+05:30'))).toBe(true);
        expect(isAfterOfficeStart(new Date('2026-11-18T14:00:00+05:30'))).toBe(true);
    });

    it('weekday, ranges and month parsing', () => {
        expect(weekdayOfKey('2026-11-19')).toBe(4); // Thursday
        expect(eachDayKey('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
        const { start, end } = monthRange(2026, 12);
        expect(dayKey(start)).toBe('2026-12-01');
        expect(dayKey(end)).toBe('2027-01-01');
        expect(parseMonthKey('2026-13')).toBeNull();
        expect(parseMonthKey('2026-02')).toEqual({ year: 2026, month: 2, key: '2026-02' });
    });
});
