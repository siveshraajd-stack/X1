import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { applyBiometricDay, getNonWorkingBlock } from '@/lib/attendance-core';
import { dayKey, dayStart } from '@/lib/dates';
import { AppError } from '@/lib/errors';

export const MAX_PUNCHES_PER_REQUEST = 5000;

// Field names used by common machines / vendor APIs (ZKTeco, eSSL, Realtime, Matrix ...)
const ID_FIELDS = ['biometricId', 'biometric_id', 'userId', 'user_id', 'employeeCode', 'employee_code', 'empCode', 'emp_code', 'enrollNumber', 'enroll_number', 'enrollId', 'pin', 'badge', 'badgeNumber', 'cardNo', 'userid'];
const TIME_FIELDS = ['timestamp', 'punchTime', 'punch_time', 'punchedAt', 'checkTime', 'check_time', 'logTime', 'log_time', 'dateTime', 'datetime', 'date_time', 'time'];
const DEVICE_FIELDS = ['deviceId', 'device_id', 'sn', 'serial', 'serialNumber', 'terminalSn', 'terminal_sn', 'machineId', 'machine_id'];
const DIRECTION_FIELDS = ['direction', 'punchType', 'punch_type', 'inOut', 'in_out', 'state', 'status'];

function pick(raw, names) {
    for (const name of names) {
        if (raw[name] !== undefined && raw[name] !== null && String(raw[name]).trim() !== '') return raw[name];
    }
    // case-insensitive fallback
    const lower = Object.fromEntries(Object.keys(raw).map((k) => [k.toLowerCase(), k]));
    for (const name of names) {
        const k = lower[name.toLowerCase()];
        if (k && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k];
    }
    return undefined;
}

/**
 * Parse a punch time. Values without a time zone are treated as India time
 * (what the machine's clock shows). Returns a Date or null.
 */
export function parsePunchTime(value, dateValue) {
    if (value === undefined || value === null) return null;

    if (typeof value === 'number' || /^\d{9,13}$/.test(String(value).trim())) {
        const n = Number(value);
        const ms = n > 1e11 ? n : n * 1000; // seconds vs milliseconds
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    let text = String(value).trim();
    if (dateValue && /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) text = `${String(dateValue).trim()} ${text}`;

    // 2026-11-18 09:05:00 | 2026-11-18T09:05 (no zone => IST)
    let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (m) return istDate(m[1], m[2], m[3], m[4], m[5], m[6]);

    // 18-11-2026 09:05:00 | 18/11/2026 09:05 (day first, as used in India)
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (m) return istDate(m[3], m[2], m[1], m[4], m[5], m[6]);

    // 2026-11-18T09:05:00Z / +05:30
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
        const d = new Date(text);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function istDate(y, mo, d, h, mi, s) {
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${mi}:${String(s || '00').padStart(2, '0')}+05:30`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    // Reject impossible dates such as 31 Feb that Date would roll over
    if (dayKey(date) !== `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`) return null;
    return date;
}

/** One raw record -> { biometricId, punchTime, deviceId, direction } or { error } */
export function normalizePunch(raw) {
    if (!raw || typeof raw !== 'object') return { error: 'Punch must be an object' };
    const id = pick(raw, ID_FIELDS);
    if (id === undefined) return { error: 'Missing employee/biometric id' };
    const time = parsePunchTime(pick(raw, TIME_FIELDS), pick(raw, ['date']));
    if (!time) return { error: 'Missing or unreadable punch time' };
    const direction = pick(raw, DIRECTION_FIELDS);
    return {
        biometricId: String(id).trim(),
        punchTime: time,
        deviceId: pick(raw, DEVICE_FIELDS) !== undefined ? String(pick(raw, DEVICE_FIELDS)).trim() : null,
        direction: direction !== undefined && String(direction).length <= 20 ? String(direction).trim() : null,
    };
}

/** Constant-time API key check against BIOMETRIC_API_KEY. */
export function verifyApiKey(provided) {
    const expected = process.env.BIOMETRIC_API_KEY;
    if (!expected || expected.length < 16) {
        throw new AppError('Biometric integration is not configured on the server', 503);
    }
    if (!provided) return false;
    const a = crypto.createHash('sha256').update(String(provided)).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

/** Company the machine belongs to: BIOMETRIC_COMPANY_ID, or the only company. */
export async function resolveCompanyId() {
    if (process.env.BIOMETRIC_COMPANY_ID) return process.env.BIOMETRIC_COMPANY_ID;
    const companies = await prisma.company.findMany({ select: { id: true }, take: 2 });
    if (companies.length === 1) return companies[0].id;
    throw new AppError('Set BIOMETRIC_COMPANY_ID: more than one company exists', 500);
}

/**
 * Store punches and turn them into attendance.
 * Safe to call again with the same punches (duplicates are skipped and the
 * day is recalculated from every stored punch).
 */
export async function processPunches(companyId, rawPunches, now = new Date()) {
    const summary = { received: rawPunches.length, applied: 0, ignored: 0, unmapped: 0, duplicates: 0, rejected: [] };
    const valid = [];

    rawPunches.forEach((raw, index) => {
        const p = normalizePunch(raw);
        if (p.error) summary.rejected.push({ index, reason: p.error });
        else if (p.punchTime.getTime() > now.getTime() + 5 * 60 * 1000) summary.rejected.push({ index, reason: 'Punch time is in the future' });
        else valid.push(p);
    });
    if (valid.length === 0) return summary;

    const users = await prisma.user.findMany({
        where: { companyId, biometricId: { in: [...new Set(valid.map((p) => p.biometricId))] } },
        select: { id: true, name: true, companyId: true, managerId: true, createdAt: true, biometricId: true },
    });
    const byBio = new Map(users.map((u) => [u.biometricId, u]));

    // Decide the fate of each punch (per user + day checks are cached)
    const blockCache = new Map();
    const leaveCache = new Map();
    const rows = [];
    for (const p of valid) {
        const user = byBio.get(p.biometricId);
        const base = { companyId, biometricId: p.biometricId, punchTime: p.punchTime, deviceId: p.deviceId, direction: p.direction };
        if (!user) {
            rows.push({ ...base, userId: null, status: 'UNMAPPED', reason: 'No employee has this biometric id' });
            continue;
        }
        const key = dayKey(p.punchTime);

        if (!blockCache.has(key)) blockCache.set(key, await getNonWorkingBlock(companyId, key));
        const block = blockCache.get(key);

        const leaveKey = `${user.id}:${key}`;
        if (!leaveCache.has(leaveKey)) {
            const leave = await prisma.leaveRequest.findFirst({
                where: { userId: user.id, status: 'APPROVED', startDate: { lte: dayStart(key) }, endDate: { gte: dayStart(key) } },
                select: { id: true, autoGenerated: true, type: true },
            });
            // The auto "late marks" leave sits on a day the employee DID come in,
            // and an approved Work From Home request is not leave either
            leaveCache.set(leaveKey, Boolean(leave && !leave.autoGenerated && !['WFH', 'OD'].includes(leave.type)));
        }

        if (block) rows.push({ ...base, userId: user.id, status: 'IGNORED', reason: block });
        else if (leaveCache.get(leaveKey)) rows.push({ ...base, userId: user.id, status: 'IGNORED', reason: 'Approved leave on this day' });
        else rows.push({ ...base, userId: user.id, status: 'APPLIED', reason: null });
    }

    const created = await prisma.biometricPunch.createMany({ data: rows, skipDuplicates: true });
    summary.duplicates = rows.length - created.count;
    for (const r of rows) {
        if (r.status === 'APPLIED') summary.applied += 1;
        else if (r.status === 'IGNORED') summary.ignored += 1;
        else summary.unmapped += 1;
    }

    // Recalculate every affected (user, day) from ALL stored applied punches
    const days = new Map();
    for (const r of rows) {
        if (r.status !== 'APPLIED') continue;
        days.set(`${r.userId}|${dayKey(r.punchTime)}`, { user: byBio.get(r.biometricId), key: dayKey(r.punchTime) });
    }
    for (const { user, key } of days.values()) {
        const start = dayStart(key);
        const stored = await prisma.biometricPunch.findMany({
            where: { userId: user.id, status: 'APPLIED', punchTime: { gte: start, lt: new Date(start.getTime() + 24 * 3600 * 1000) } },
            select: { punchTime: true },
        });
        await applyBiometricDay({ user, key, punchTimes: stored.map((s) => s.punchTime), now });
    }

    return summary;
}

/** After an admin assigns a biometric id, re-run punches that were UNMAPPED for it. */
export async function reprocessUnmapped(companyId, biometricId) {
    if (!biometricId) return null;
    const pending = await prisma.biometricPunch.findMany({
        where: { companyId, biometricId, status: 'UNMAPPED' },
        select: { id: true, biometricId: true, punchTime: true, deviceId: true, direction: true },
    });
    if (pending.length === 0) return null;
    await prisma.biometricPunch.deleteMany({ where: { id: { in: pending.map((p) => p.id) } } });
    return processPunches(
        companyId,
        pending.map((p) => ({ biometricId: p.biometricId, timestamp: p.punchTime.toISOString(), deviceId: p.deviceId, direction: p.direction }))
    );
}
