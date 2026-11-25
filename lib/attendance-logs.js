// "My Logs": one row per day with the biometric check in / check out, the idle time and the hours worked.
// Pure functions only (the API route loads the rows).

import { dayKey } from '@/lib/dates';
import { workedMinutes } from '@/lib/work-hours';

/**
 * @param {Array} records   attendance rows of the month
 * @param {Array} episodes  idle episodes of the month ({ date, startedAt, endedAt, idleSeconds })
 * @returns {Array} rows, newest day first:
 *   { date, checkIn, checkOut (biometric only), idleSeconds, idleEpisodes: [{ start, end, seconds }], workedMinutes }
 */
export function buildLogRows(records, episodes, now = new Date()) {
    const rows = new Map();
    const rowFor = (key) => {
        if (!rows.has(key)) rows.set(key, { date: key, checkIn: null, checkOut: null, idleSeconds: 0, idleEpisodes: [], workedMinutes: 0 });
        return rows.get(key);
    };

    for (const record of records || []) {
        const row = rowFor(dayKey(record.date));
        row.checkIn = record.checkIn ? new Date(record.checkIn).toISOString() : null;
        row.checkOut = record.checkOut ? new Date(record.checkOut).toISOString() : null;
        row.workedMinutes = workedMinutes(record, now);
    }

    for (const episode of episodes || []) {
        const seconds = Math.max(0, Number(episode.idleSeconds) || 0);
        if (!seconds) continue;
        const row = rowFor(dayKey(episode.date));
        row.idleSeconds += seconds;
        row.idleEpisodes.push({ start: new Date(episode.startedAt).toISOString(), end: new Date(episode.endedAt).toISOString(), seconds });
    }

    for (const row of rows.values()) row.idleEpisodes.sort((a, b) => a.start.localeCompare(b.start));
    return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date));
}
