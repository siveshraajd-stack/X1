// Date helpers pinned to India Standard Time (UTC+05:30, no DST).
// Every "day" in the app (attendance date, leave dates, holidays) is stored as
// the instant of midnight IST, so results do not depend on the server's TZ.

const IST_OFFSET_MS = 330 * 60 * 1000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function shifted(date) {
    return new Date(date.getTime() + IST_OFFSET_MS);
}

/** { y, m (1-12), d, h, min, dow (0=Sun) } of an instant, in IST */
export function istParts(date = new Date()) {
    const s = shifted(date);
    return {
        y: s.getUTCFullYear(),
        m: s.getUTCMonth() + 1,
        d: s.getUTCDate(),
        h: s.getUTCHours(),
        min: s.getUTCMinutes(),
        dow: s.getUTCDay(),
    };
}

/** 'YYYY-MM-DD' of an instant, in IST */
export function dayKey(date = new Date()) {
    const { y, m, d } = istParts(date);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Validate a 'YYYY-MM-DD' key (real calendar date). Returns key or null. */
export function normalizeDayKey(value) {
    if (typeof value !== 'string') return null;
    const match = KEY_RE.exec(value.trim());
    if (!match) return null;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
    return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Instant of midnight IST for a 'YYYY-MM-DD' key (or any Date) */
export function dayStart(keyOrDate) {
    const key = typeof keyOrDate === 'string' ? normalizeDayKey(keyOrDate) : dayKey(keyOrDate);
    if (!key) throw new Error('Invalid date');
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** Weekday (0=Sun) of a 'YYYY-MM-DD' key */
export function weekdayOfKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysToKey(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Inclusive list of day keys from startKey to endKey */
export function eachDayKey(startKey, endKey) {
    const out = [];
    let cur = startKey;
    // Guard against runaway loops on bad input
    for (let i = 0; i < 4000 && cur <= endKey; i++) {
        out.push(cur);
        cur = addDaysToKey(cur, 1);
    }
    return out;
}

export function monthKeyOf(date = new Date()) {
    const { y, m } = istParts(date);
    return `${y}-${String(m).padStart(2, '0')}`;
}

/** Parse 'YYYY-MM' -> { year, month (1-12), key } or null */
export function parseMonthKey(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return { year, month, key: `${match[1]}-${match[2]}` };
}

/** [start, end) instants of a month in IST */
export function monthRange(year, month) {
    const start = dayStart(`${year}-${String(month).padStart(2, '0')}-01`);
    const nextY = month === 12 ? year + 1 : year;
    const nextM = month === 12 ? 1 : month + 1;
    const end = dayStart(`${nextY}-${String(nextM).padStart(2, '0')}-01`);
    return { start, end };
}

export function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** [start, end) instants of a calendar year in IST */
export function yearRange(year) {
    return { start: dayStart(`${year}-01-01`), end: dayStart(`${year + 1}-01-01`) };
}

/** True when the instant is later than 09:00 IST (09:00:xx counts as on time) */
export function isAfterOfficeStart(date, startHour = 9, startMinute = 0) {
    const { h, min } = istParts(date);
    return h > startHour || (h === startHour && min > startMinute);
}
