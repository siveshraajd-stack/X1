/** @jest-environment node */
import { computeIdle, exclusionsForDay, exclusionAt, activeMs, IDLE_THRESHOLD_MS } from '@/lib/idle';
import { dayStart } from '@/lib/dates';

const KEY = '2026-11-18';
const at = (h, m = 0) => dayStart(KEY).getTime() + (h * 60 + m) * 60000;
const MIN = 60000;

describe('idle rule', () => {
    const ex = exclusionsForDay(KEY);

    it('threshold is 5 minutes', () => {
        expect(IDLE_THRESHOLD_MS).toBe(5 * MIN);
    });

    it('under 5 minutes is not idle', () => {
        const r = computeIdle({ startedAt: at(11), endedAt: at(11, 4), exclusions: ex });
        expect(r.triggered).toBe(false);
        expect(r.idleMs).toBe(0);
    });

    it('counts only the minutes after the first 5', () => {
        const r = computeIdle({ startedAt: at(11), endedAt: at(11, 12), exclusions: ex });
        expect(r.triggered).toBe(true);
        expect(r.idleMs).toBe(7 * MIN);
    });

    it('lunch is never idle time', () => {
        // still from 12:50 to 14:20: 10 min + 20 min outside lunch = 30 quiet min -> 25 counted
        const r = computeIdle({ startedAt: at(12, 50), endedAt: at(14, 20), exclusions: ex });
        expect(r.quietMs).toBe(30 * MIN);
        expect(r.idleMs).toBe(25 * MIN);
        // entirely inside lunch
        expect(computeIdle({ startedAt: at(13, 5), endedAt: at(13, 55), exclusions: ex }).triggered).toBe(false);
    });

    it('breaks are excluded', () => {
        // 10:10 -> 10:40: 5 min before + 10 min after the break = 15 quiet -> 10 counted
        expect(computeIdle({ startedAt: at(10, 10), endedAt: at(10, 40), exclusions: ex }).idleMs).toBe(10 * MIN);
        // 15:25 -> 15:50: 5 + 5 = 10 quiet -> 5 counted
        expect(computeIdle({ startedAt: at(15, 25), endedAt: at(15, 50), exclusions: ex }).idleMs).toBe(5 * MIN);
    });

    it('a Teams meeting is excluded', () => {
        const withMeeting = exclusionsForDay(KEY, [{ start: at(11), end: at(12), label: 'Teams meeting' }]);
        // still 11:00-12:30 with a meeting 11:00-12:00 -> 30 quiet min -> 25 counted
        expect(computeIdle({ startedAt: at(11), endedAt: at(12, 30), exclusions: withMeeting }).idleMs).toBe(25 * MIN);
        // a meeting that overlaps lunch merges, nothing is subtracted twice
        const overlap = exclusionsForDay(KEY, [{ start: at(12, 30), end: at(13, 30) }]);
        expect(activeMs(at(12), at(14), overlap)).toBe(30 * MIN); // only 12:00-12:30 is left: meeting + lunch merge into 12:30-14:00
    });

    it('nothing before clock-in or after clock-out counts', () => {
        const r = computeIdle({ startedAt: at(8), endedAt: at(9, 20), exclusions: ex, workStart: at(9) });
        expect(r.quietMs).toBe(20 * MIN);
        const out = computeIdle({ startedAt: at(16), endedAt: at(17), exclusions: ex, workEnd: at(16, 10) });
        expect(out.triggered).toBe(true);
        expect(out.idleMs).toBe(5 * MIN);
    });

    it('finds the exclusion that covers a moment', () => {
        expect(exclusionAt(at(10, 20), ex).label).toBe('Morning break');
        expect(exclusionAt(at(13), ex).label).toBe('Lunch');
        expect(exclusionAt(at(14), ex)).toBeNull(); // lunch ends at 14:00 sharp
        expect(exclusionAt(at(11), ex)).toBeNull();
    });
});
