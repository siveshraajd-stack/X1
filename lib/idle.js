// Cursor-inactivity rules shared by the employee dashboard (browser) and the idle API (server).
// Pure functions only: no database, no network.
//
// Rule: time inside an unpaid break, lunch or a Teams meeting is "excluded" - it is removed from the
// timeline, so it can never be idle time. When the cursor has not moved for IDLE_THRESHOLD_MINUTES of
// the remaining (non-excluded) time, the employee is idle: they are notified once, and every further
// non-excluded minute without cursor movement is counted as idle minutes.

import { IDLE_THRESHOLD_MINUTES } from '@/lib/constants';
import { breakIntervalsForDay, mergeIntervals, overlapMs } from '@/lib/work-hours';

export const IDLE_THRESHOLD_MS = IDLE_THRESHOLD_MINUTES * 60 * 1000;

/** Breaks + lunch + meetings of one IST day: the raw (labelled) list. */
export function exclusionsForDay(key, meetings = []) {
    const meetingList = (meetings || []).map((m) => ({
        label: m.label || 'Meeting',
        start: typeof m.start === 'number' ? m.start : new Date(m.start).getTime(),
        end: typeof m.end === 'number' ? m.end : new Date(m.end).getTime(),
    }));
    return [...breakIntervalsForDay(key), ...meetingList].filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start);
}

/** The exclusion (break / lunch / meeting) that covers `atMs`, or null. */
export function exclusionAt(atMs, exclusions) {
    return (exclusions || []).find((i) => atMs >= i.start && atMs < i.end) || null;
}

/** Milliseconds of [startMs, endMs) that are NOT excluded. */
export function activeMs(startMs, endMs, exclusions) {
    if (!(endMs > startMs)) return 0;
    return endMs - startMs - overlapMs(startMs, endMs, mergeIntervals(exclusions));
}

/**
 * One no-cursor-movement episode.
 *
 * @param {object} p
 * @param {number} p.startedAt   ms of the last cursor movement
 * @param {number} p.endedAt     ms of the next movement (or "now" while still idle)
 * @param {Array}  p.exclusions  breaks / lunch / meetings ({start,end} in ms)
 * @param {number} [p.workStart] ms of clock-in: nothing before it counts
 * @param {number|null} [p.workEnd] ms of clock-out: nothing after it counts
 * @returns {{ idleMs: number, quietMs: number, triggered: boolean }}
 *   quietMs   non-excluded time without movement (inside the work window)
 *   triggered quietMs reached the threshold (the 5-minute alert applies)
 *   idleMs    quietMs beyond the threshold: the time that is counted
 */
export function computeIdle({ startedAt, endedAt, exclusions, workStart = -Infinity, workEnd = null }) {
    const start = Math.max(startedAt, workStart);
    const end = workEnd == null ? endedAt : Math.min(endedAt, workEnd);
    const quietMs = activeMs(start, end, exclusions);
    const triggered = quietMs >= IDLE_THRESHOLD_MS;
    return { idleMs: triggered ? quietMs - IDLE_THRESHOLD_MS : 0, quietMs, triggered };
}
