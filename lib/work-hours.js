import { addDaysToKey, dayKey, dayStart, monthRange, weekdayOfKey } from '@/lib/dates';
import { UNPAID_BREAKS } from '@/lib/constants';

const MINUTE = 60 * 1000;

// ---------------------------------------------------------------------------
// Intervals ({ start, end } in epoch ms) and unpaid breaks
// ---------------------------------------------------------------------------

/** Sort and merge overlapping / touching intervals. Drops empty or invalid ones. */
export function mergeIntervals(list) {
    const sorted = (list || [])
        .filter((i) => i && Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
        .map((i) => ({ ...i }))
        .sort((a, b) => a.start - b.start);
    const out = [];
    for (const i of sorted) {
        const last = out[out.length - 1];
        if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
        else out.push(i);
    }
    return out;
}

/** Milliseconds of [start, end) that fall inside the given (merged) intervals. */
export function overlapMs(start, end, merged) {
    let total = 0;
    for (const i of merged) {
        const s = Math.max(start, i.start);
        const e = Math.min(end, i.end);
        if (e > s) total += e - s;
    }
    return total;
}

/** The unpaid break windows (morning break, lunch, afternoon break) of one IST day, as instants. */
export function breakIntervalsForDay(key) {
    const base = dayStart(key).getTime();
    return UNPAID_BREAKS.map((b) => {
        const [sh, sm] = b.start.split(':').map(Number);
        const [eh, em] = b.end.split(':').map(Number);
        return { label: b.label, start: base + (sh * 60 + sm) * MINUTE, end: base + (eh * 60 + em) * MINUTE };
    });
}

/**
 * Milliseconds between start and end that count as working time:
 * the span minus the unpaid breaks of every IST day it touches.
 */
export function netWorkMs(startMs, endMs) {
    if (!(endMs > startMs)) return 0;
    const breaks = [];
    let key = dayKey(new Date(startMs));
    const lastKey = dayKey(new Date(endMs));
    for (let i = 0; i < 400 && key <= lastKey; i++) {
        breaks.push(...breakIntervalsForDay(key));
        key = addDaysToKey(key, 1);
    }
    return Math.max(0, endMs - startMs - overlapMs(startMs, endMs, mergeIntervals(breaks)));
}

/** First / last mark of a record: a complete biometric pair, then a complete web pair, then any mix. */
export function recordSpan(record) {
    if (!record) return { inTime: null, outTime: null };
    if (record.checkIn && record.checkOut) return { inTime: record.checkIn, outTime: record.checkOut };
    if (record.clockIn && record.clockOut) return { inTime: record.clockIn, outTime: record.clockOut };
    return { inTime: record.checkIn || record.clockIn || null, outTime: record.checkOut || record.clockOut || null };
}

/**
 * Minutes worked on one attendance record.
 * Prefers a complete biometric pair, then a complete web clock pair, then any in/out mix.
 * A day that is still open (no out time) counts up to `now`, but only for today.
 * The unpaid breaks (10:15-10:30, 1:00-2:00 lunch, 3:30-3:45 IST) are not counted.
 */
export function workedMinutes(record, now = new Date()) {
    if (!record) return 0;
    const { inTime, outTime } = recordSpan(record);
    if (!inTime) return 0;
    const start = new Date(inTime).getTime();
    let end;
    if (outTime) {
        end = new Date(outTime).getTime();
    } else if (dayKey(record.date) === dayKey(now)) {
        end = now.getTime();
    } else {
        return 0; // forgot to clock out on a past day: unknown, not counted
    }
    if (!(end > start)) return 0;
    return Math.floor(netWorkMs(start, end) / MINUTE);
}

/** Monday (IST) of the week that contains `now`, as a day key */
export function weekStartKey(now = new Date()) {
    const today = dayKey(now);
    return addDaysToKey(today, -((weekdayOfKey(today) + 6) % 7));
}

/** [start, end) instants that cover both the current week and the current month */
export function hoursQueryRange(now = new Date()) {
    const [y, m] = dayKey(now).split('-').map(Number);
    const month = monthRange(y, m);
    const week = { start: dayStart(weekStartKey(now)), end: dayStart(addDaysToKey(weekStartKey(now), 7)) };
    return {
        start: new Date(Math.min(month.start.getTime(), week.start.getTime())),
        end: new Date(Math.max(month.end.getTime(), week.end.getTime())),
    };
}

/** { todayMinutes, weekMinutes, monthMinutes } from a user's attendance records */
export function computeHourTotals(records, now = new Date()) {
    const today = dayKey(now);
    const monthPrefix = today.slice(0, 7);
    const weekStart = weekStartKey(now);
    const weekEnd = addDaysToKey(weekStart, 6);
    const totals = { todayMinutes: 0, weekMinutes: 0, monthMinutes: 0 };
    for (const record of records) {
        const key = dayKey(record.date);
        const minutes = workedMinutes(record, now);
        if (!minutes) continue;
        if (key === today) totals.todayMinutes += minutes;
        if (key >= weekStart && key <= weekEnd) totals.weekMinutes += minutes;
        if (key.startsWith(monthPrefix)) totals.monthMinutes += minutes;
    }
    return totals;
}

/** 485 -> '8h 05m' */
export function formatMinutes(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/**
 * { todayIdleMinutes, weekIdleMinutes, monthIdleMinutes } from a user's idle episodes
 * (each episode: { date, idleSeconds }). Same today / week / month windows as the hour totals.
 */
export function computeIdleTotals(episodes, now = new Date()) {
    const today = dayKey(now);
    const monthPrefix = today.slice(0, 7);
    const weekStart = weekStartKey(now);
    const weekEnd = addDaysToKey(weekStart, 6);
    const seconds = { today: 0, week: 0, month: 0 };
    for (const e of episodes) {
        const key = dayKey(e.date);
        const sec = Number(e.idleSeconds) || 0;
        if (key === today) seconds.today += sec;
        if (key >= weekStart && key <= weekEnd) seconds.week += sec;
        if (key.startsWith(monthPrefix)) seconds.month += sec;
    }
    return {
        todayIdleMinutes: Math.floor(seconds.today / 60),
        weekIdleMinutes: Math.floor(seconds.week / 60),
        monthIdleMinutes: Math.floor(seconds.month / 60),
    };
}
