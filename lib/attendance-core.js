import { prisma } from '@/lib/db';
import {
    ATTENDANCE_STATUSES,
    LATE_AUTO_STATUSES,
    LATE_BLOCK_SIZE,
    OFFICE_START_HOUR,
    OFFICE_START_MINUTE,
    MIN_CHECKOUT_GAP_MS,
    NON_LEAVE_TYPES,
    WEEKEND_DAYS,
} from '@/lib/constants';
import {
    addDaysToKey,
    dayKey,
    dayStart,
    daysInMonth,
    eachDayKey,
    isAfterOfficeStart,
    istParts,
    monthRange,
    normalizeDayKey,
    weekdayOfKey,
} from '@/lib/dates';
import { AppError } from '@/lib/errors';
import { getLeaveBalance } from '@/lib/leave';
import { netWorkMs } from '@/lib/work-hours';

// ---------------------------------------------------------------------------
// Calendar building (pure functions - no database access)
// ---------------------------------------------------------------------------

function normalizeStatus(record) {
    const raw = String(record?.status || '').toUpperCase().replace(/[\s_-]+/g, '');
    if (raw === 'PRESENT') return 'PRESENT';
    if (raw === 'ABSENT') return 'ABSENT';
    if (raw === 'LATE') return 'LATE';
    if (raw === 'WFH' || raw === 'WORKFROMHOME') return 'WFH';
    if (raw === 'OD' || raw === 'ONDUTY') return 'OD';
    if (raw === 'HALFDAY') return 'HALF_DAY';
    if (raw === 'LEAVE' || raw === 'ONLEAVE') return 'ON_LEAVE';
    return record?.checkIn ? 'PRESENT' : 'ABSENT';
}

const STATUS_NOTES = {
    PRESENT: 'Present',
    ABSENT: 'Loss of pay (LOP)',
    LATE: 'Late - reported after 9:00 AM',
    WFH: 'Work from home',
    OD: 'On duty',
    HALF_DAY: 'Marked as half day',
    ON_LEAVE: 'Marked as leave',
};

export const EMPTY_SUMMARY = () => ({
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    WFH: 0,
    OD: 0,
    HALF_DAY: 0,
    ON_LEAVE: 0,
    HOLIDAY: 0,
    WEEKEND: 0,
    workingDays: 0,
});

/**
 * Build the per-day view of one month for one employee.
 *
 * @param {object} p
 * @param {number} p.year
 * @param {number} p.month 1-12
 * @param {Array}  p.records   attendance rows of that month
 * @param {Array}  p.leaves    APPROVED leaves overlapping that month
 * @param {Map<string,string>} p.holidays  dayKey -> holiday name
 * @param {Set<string>} p.overrides        dayKeys where admin allows marking
 * @param {string} p.trackingStart         dayKey the employee is tracked from
 * @param {Date}   [p.now]
 */
export function buildMonthDays({ year, month, records, leaves, holidays, overrides, trackingStart, now = new Date() }) {
    const todayKey = dayKey(now);
    const total = daysInMonth(year, month);
    const mm = String(month).padStart(2, '0');

    // One record per day (prefer the one that has a check-in)
    const byDay = new Map();
    for (const r of records) {
        const key = dayKey(r.date);
        const existing = byDay.get(key);
        if (!existing || (!existing.checkIn && r.checkIn)) byDay.set(key, r);
    }

    const days = [];
    const summary = EMPTY_SUMMARY();

    for (let d = 1; d <= total; d++) {
        const key = `${year}-${mm}-${String(d).padStart(2, '0')}`;
        const weekday = weekdayOfKey(key);
        const isWeekend = WEEKEND_DAYS.includes(weekday);
        const holidayName = holidays.get(key) || null;
        const isToday = key === todayKey;
        const isFuture = key > todayKey;
        const record = byDay.get(key) || null;
        // Work From Home / On Duty requests are not leave: they are written to the calendar as WFH / OD days
        const leave = leaves.find((l) => !NON_LEAVE_TYPES.includes(l.type) && dayKey(l.startDate) <= key && dayKey(l.endDate) >= key) || null;

        let status;
        let note;

        if (key < trackingStart && !record) {
            status = 'OUTSIDE';
            note = 'Before this employee joined the system';
        } else if (record) {
            status = normalizeStatus(record);
            note = STATUS_NOTES[status] || 'Marked';
            const hasIn = record.checkIn || record.clockIn;
            const hasOut = record.checkOut || record.clockOut;
            if (['PRESENT', 'LATE'].includes(status) && hasIn && !hasOut && !isToday && !isFuture) {
                note += ' (no check-out recorded)';
            }
        } else if (holidayName) {
            status = 'HOLIDAY';
            note = `Festival holiday: ${holidayName}`;
        } else if (isWeekend) {
            status = 'WEEKEND';
            note = 'Weekly off';
        } else if (leave) {
            status = 'ON_LEAVE';
            note = `Approved ${String(leave.type || '').toLowerCase().replace(/_/g, ' ')} leave`;
        } else if (isFuture) {
            status = 'OUTSIDE';
            note = 'Upcoming day';
        } else if (isToday) {
            status = 'PENDING';
            note = 'Not marked yet today';
        } else {
            status = 'ABSENT';
            note = 'Loss of pay (LOP): no attendance marked and no approved leave';
        }

        // Biometric punches are the reference; web clock times are the fallback
        const inTime = record?.checkIn || record?.clockIn || null;
        const outTime = record?.checkOut || record?.clockOut || null;
        let workHours = null;
        if (inTime && outTime) {
            workHours = Math.floor((netWorkMs(new Date(inTime).getTime(), new Date(outTime).getTime()) / 3600000) * 100) / 100; // unpaid breaks excluded
        }

        if (status in summary) summary[status] += 1;
        if (!isWeekend && !holidayName && status !== 'OUTSIDE' && status !== 'PENDING') summary.workingDays += 1;

        days.push({
            date: key,
            weekday,
            status,
            note,
            holidayName,
            isWeekend,
            markingAllowedByAdmin: overrides.has(key),
            hasRecord: !!record,
            checkIn: record?.checkIn || null,
            checkOut: record?.checkOut || null,
            clockIn: record?.clockIn || null,
            clockOut: record?.clockOut || null,
            workHours,
            leaveType: leave?.type || null,
            leaveReason: leave?.reason || null,
        });
    }

    return { days, summary };
}

/** Late count shown as "X/5": the 5th mark shows 5/5, the next one starts at 1/5. */
export function lateProgress(lateCount) {
    const inBlock = lateCount > 0 && lateCount % LATE_BLOCK_SIZE === 0 ? LATE_BLOCK_SIZE : lateCount % LATE_BLOCK_SIZE;
    return { lateCount, inBlock, blockSize: LATE_BLOCK_SIZE, deductedDays: Math.floor(lateCount / LATE_BLOCK_SIZE) };
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/** Holidays + admin overrides for [start, end) of a company */
export async function loadCompanyCalendar(companyId, start, end) {
    if (!companyId) return { holidays: new Map(), overrides: new Set() };
    const [holidayRows, overrideRows] = await Promise.all([
        prisma.holiday.findMany({ where: { companyId, date: { gte: start, lt: end } }, select: { date: true, name: true } }),
        prisma.attendanceOverride.findMany({ where: { companyId, date: { gte: start, lt: end } }, select: { date: true } }),
    ]);
    return {
        holidays: new Map(holidayRows.map((h) => [dayKey(h.date), h.name])),
        overrides: new Set(overrideRows.map((o) => dayKey(o.date))),
    };
}

/** Day the employee is tracked from: account creation, or earlier first record. */
export async function getTrackingStart(user) {
    const earliest = await prisma.attendance.findFirst({
        where: { userId: user.id },
        orderBy: { date: 'asc' },
        select: { date: true },
    });
    let start = dayKey(user.createdAt);
    if (earliest && dayKey(earliest.date) < start) start = dayKey(earliest.date);
    return start;
}

/** Full month view for one employee (used by employee and admin/manager calendars). */
export async function getEmployeeMonth(user, year, month, now = new Date()) {
    const { start, end } = monthRange(year, month);
    const [records, leaves, calendar, trackingStart] = await Promise.all([
        prisma.attendance.findMany({ where: { userId: user.id, date: { gte: start, lt: end } }, orderBy: { date: 'asc' } }),
        prisma.leaveRequest.findMany({
            where: { userId: user.id, status: 'APPROVED', startDate: { lt: end }, endDate: { gte: start } },
        }),
        loadCompanyCalendar(user.companyId, start, end),
        getTrackingStart(user),
    ]);

    const { days, summary } = buildMonthDays({
        year,
        month,
        records,
        leaves,
        holidays: calendar.holidays,
        overrides: calendar.overrides,
        trackingStart,
        now,
    });

    return { days, summary, trackingStart, lateCount: summary.LATE, ...lateProgress(summary.LATE) };
}

// ---------------------------------------------------------------------------
// Marking attendance
// ---------------------------------------------------------------------------

/** Create the automatic leave days for every full block of 5 late marks. */
export async function ensureLateDeductions({ user, monthKey, lateCount, dateKey, now }) {
    const blocks = Math.floor(lateCount / LATE_BLOCK_SIZE);
    const created = [];
    const year = Number(dateKey.slice(0, 4));

    for (let block = 1; block <= blocks; block++) {
        const lateKey = `${user.id}:${monthKey}:${block}`;
        const already = await prisma.leaveRequest.findUnique({ where: { lateKey }, select: { id: true } });
        if (already) continue;

        const balance = await getLeaveBalance(user.id, year);
        const type = balance.casual.remaining >= 1 ? 'CASUAL' : 'LOP';
        const marks = block * LATE_BLOCK_SIZE;

        try {
            await prisma.leaveRequest.create({
                data: {
                    userId: user.id,
                    managerId: user.managerId || null,
                    type,
                    startDate: dayStart(dateKey),
                    endDate: dayStart(dateKey),
                    days: 1,
                    status: 'APPROVED',
                    reason: `Automatic deduction: ${marks} late marks in ${monthKey}`,
                    autoGenerated: true,
                    lateKey,
                    decidedAt: now,
                },
            });
        } catch (error) {
            if (error.code === 'P2002') continue; // another request created it first
            throw error;
        }

        const message =
            `You have reached ${marks} late marks this month. 1 day leave has been deducted.` +
            (type === 'LOP' ? ' You had no leave balance left, so it was recorded as LOP (Loss of Pay).' : '');
        await prisma.notification.create({
            data: { userId: user.id, type: 'LATE_DEDUCTION', title: 'Late marks: 1 day leave deducted', message, priority: 'HIGH' },
        });
        created.push({ marks, type, message });
    }
    return created;
}

/**
 * Mark attendance for the logged in employee.
 *
 * Rules enforced here (the UI only mirrors them):
 *  - statuses: PRESENT, ABSENT, LATE, WFH, OD
 *  - no future dates; past days only inside the current month and only if not marked yet
 *  - not on festival holidays / weekends unless the admin allowed that date
 *  - not on a day with approved leave
 *  - PRESENT/WFH marked after 9:00 AM (IST) on the same day become LATE
 *  - LATE marks are locked for the employee (only an admin can change them)
 *  - every 5th LATE mark in a month creates 1 auto-approved leave day
 */
export async function markAttendance({ user, status, targetKey, now = new Date() }) {
    const requested = String(status || '').toUpperCase();
    if (!ATTENDANCE_STATUSES.includes(requested)) {
        throw new AppError(`Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`, 400);
    }

    const todayKey = dayKey(now);
    const key = targetKey ? normalizeDayKey(targetKey) : todayKey;
    if (!key) throw new AppError('Invalid date. Use YYYY-MM-DD', 400);
    if (key > todayKey) throw new AppError('You cannot mark attendance for a future date', 400);
    if (key < todayKey && key.slice(0, 7) !== todayKey.slice(0, 7)) {
        throw new AppError('Past days can only be marked within the current month', 400);
    }

    const isToday = key === todayKey;
    const date = dayStart(key);

    // Holiday / weekend guard
    const [holiday, override] = user.companyId
        ? await Promise.all([
              prisma.holiday.findUnique({ where: { companyId_date: { companyId: user.companyId, date } } }),
              prisma.attendanceOverride.findUnique({ where: { companyId_date: { companyId: user.companyId, date } } }),
          ])
        : [null, null];
    const isWeekend = WEEKEND_DAYS.includes(weekdayOfKey(key));
    if ((holiday || isWeekend) && !override) {
        throw new AppError(
            holiday
                ? `${holiday.name} is a festival holiday. Attendance cannot be marked unless the admin allows it.`
                : 'This is a weekend. Attendance cannot be marked unless the admin allows it.',
            400
        );
    }

    const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId: user.id, date } } });
    if (existing?.checkIn && requested === 'ABSENT') {
        throw new AppError('A biometric punch is recorded for this day, so it cannot be marked absent.', 400);
    }
    // A day covered by an approved OD claim stays On Duty: it cannot be turned into Present / Late / Absent
    if (existing && String(existing.status).toUpperCase() === 'OD' && requested !== 'OD') {
        const approvedOd = await prisma.expenseClaim.findFirst({
            where: { userId: user.id, status: 'APPROVED', fromDate: { lte: date }, toDate: { gte: date } },
            select: { id: true },
        });
        if (approvedOd) {
            throw new AppError('This day is approved On Duty (OD), so it cannot be changed. Please contact your admin.', 403);
        }
    }
    if (existing) {
        if (String(existing.status).toUpperCase() === 'LATE') {
            throw new AppError('A late mark cannot be changed. Please contact your admin.', 403);
        }
        if (!isToday) {
            throw new AppError('Attendance for this day is already marked. Please contact your admin to change it.', 403);
        }
    }

    const leave = await prisma.leaveRequest.findFirst({
        where: { userId: user.id, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
        select: { id: true, type: true },
    });
    // Approved Work From Home is not leave: the employee still clocks in, and Present becomes WFH
    const wfhApproved = Boolean(leave && leave.type === 'WFH');
    // An approved On Duty request keeps the day On Duty, like an approved OD claim
    if (leave && leave.type === 'OD' && requested !== 'OD') {
        throw new AppError('This day is approved On Duty (OD), so it cannot be changed. Please contact your admin.', 403);
    }
    if (leave && !wfhApproved && leave.type !== 'OD') throw new AppError('You have approved leave on this day', 400);

    // Late rule: judged by the time of the FIRST mark of the day
    // (the biometric punch if there is one, else the first web clock-in)
    let finalStatus = wfhApproved && requested === 'PRESENT' ? 'WFH' : requested;
    const firstMark = existing?.checkIn || existing?.clockIn || now;
    if (isToday && LATE_AUTO_STATUSES.includes(finalStatus) && isAfterOfficeStart(firstMark, OFFICE_START_HOUR, OFFICE_START_MINUTE)) {
        finalStatus = 'LATE';
    }

    // Web clock times only; biometric check-in/out are never touched here
    let clockIn = existing?.clockIn ?? null;
    let clockOut = existing?.clockOut ?? null;
    if (finalStatus === 'ABSENT') {
        clockIn = null;
        clockOut = null;
    } else if (isToday && !clockIn) {
        clockIn = now;
    }

    const attendance = await prisma.attendance.upsert({
        where: { userId_date: { userId: user.id, date } },
        create: { userId: user.id, date, status: finalStatus, clockIn, clockOut },
        update: { status: finalStatus, clockIn, clockOut },
    });

    let deductions = [];
    let lateCount = null;
    if (finalStatus === 'LATE') {
        const { y, m } = istParts(date);
        const { start, end } = monthRange(y, m);
        lateCount = await prisma.attendance.count({
            where: { userId: user.id, status: 'LATE', date: { gte: start, lt: end } },
        });
        deductions = await ensureLateDeductions({
            user,
            monthKey: `${y}-${String(m).padStart(2, '0')}`,
            lateCount,
            dateKey: key,
            now,
        });
    }

    const notices = [];
    if (finalStatus === 'LATE' && requested !== 'LATE') notices.push('You reported after 9:00 AM, so today is marked as LATE.');
    for (const d of deductions) notices.push(d.message);

    return { attendance, status: finalStatus, lateCount, deductions, notice: notices.join(' ') || null };
}


// ---------------------------------------------------------------------------
// On Duty (OD): an approved OD claim marks every working day of its period as OD
// ---------------------------------------------------------------------------

/**
 * Drop the automatic "5 late marks = 1 day leave" deductions of a month that are no longer earned
 * (a LATE day was turned into OD, so the late count went down). The leave balance is given back.
 */
export async function reconcileLateDeductions({ userId, year, month }) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const { start, end } = monthRange(year, month);
    const lateCount = await prisma.attendance.count({
        where: { userId, status: 'LATE', date: { gte: start, lt: end } },
    });
    const earnedBlocks = Math.floor(lateCount / LATE_BLOCK_SIZE);
    const autos = await prisma.leaveRequest.findMany({
        where: { userId, autoGenerated: true, lateKey: { startsWith: `${userId}:${monthKey}:` } },
        select: { id: true, lateKey: true },
    });
    const removed = [];
    for (const auto of autos) {
        const block = Number(String(auto.lateKey).split(':').pop());
        if (!Number.isFinite(block) || block <= earnedBlocks) continue;
        await prisma.leaveRequest.delete({ where: { id: auto.id } });
        removed.push(block);
    }
    if (removed.length) {
        await prisma.notification.create({
            data: {
                userId,
                type: 'LATE_DEDUCTION',
                title: 'Late deduction reversed',
                message:
                    `Some of your late days in ${monthKey} are now On Duty, so you have ${lateCount} late mark${lateCount === 1 ? '' : 's'}. ` +
                    `${removed.length} automatic leave deduction${removed.length === 1 ? ' was' : 's were'} reversed.`,
                priority: 'NORMAL',
            },
        });
    }
    return removed.length;
}

/**
 * Write a status (OD or WFH) on every working day of a period, replacing Present / Late / Absent,
 * so the calendar, summaries and dashboards all show it.
 *
 * Skipped days: weekends and company holidays (unless HR allowed marking that date), days with
 * approved LEAVE (a Work From Home request is not leave), days before the employee joined, and
 * any status listed in `keepStatuses` (e.g. an approved OD day is never turned into WFH).
 * Biometric / clock times are never touched. Safe to run twice (idempotent).
 */
async function markStatusDays({ userId, fromKey, toKey, status, keepStatuses = [] }) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, createdAt: true, companyId: true },
    });
    if (!user) return { marked: [], skipped: [] };

    const from = dayStart(fromKey);
    const to = dayStart(addDaysToKey(toKey, 1)); // exclusive end
    const [calendar, trackingStart, leaveRows, records] = await Promise.all([
        loadCompanyCalendar(user.companyId, from, to),
        getTrackingStart(user),
        prisma.leaveRequest.findMany({
            where: { userId, status: 'APPROVED', startDate: { lt: to }, endDate: { gte: from } },
            select: { startDate: true, endDate: true, type: true },
        }),
        prisma.attendance.findMany({ where: { userId, date: { gte: from, lt: to } } }),
    ]);
    // Only real leave blocks the day; an approved Work From Home request does not
    const leaves = leaveRows.filter((l) => !NON_LEAVE_TYPES.includes(l.type));
    const recordByDay = new Map(records.map((r) => [dayKey(r.date), r]));

    const marked = [];
    const skipped = [];
    const lateMonths = new Map(); // months where a LATE day was replaced
    for (const key of eachDayKey(fromKey, toKey)) {
        const existing = recordByDay.get(key) || null;
        const existingStatus = String(existing?.status || '').toUpperCase();
        const nonWorking = WEEKEND_DAYS.includes(weekdayOfKey(key)) || calendar.holidays.has(key);
        if (nonWorking && !calendar.overrides.has(key)) {
            skipped.push({ date: key, reason: calendar.holidays.has(key) ? 'Holiday' : 'Weekend' });
            continue;
        }
        if (leaves.some((l) => dayKey(l.startDate) <= key && dayKey(l.endDate) >= key)) {
            skipped.push({ date: key, reason: 'Approved leave' });
            continue;
        }
        if (key < trackingStart && !existing) {
            skipped.push({ date: key, reason: 'Before joining' });
            continue;
        }
        if (existing && keepStatuses.includes(existingStatus)) {
            skipped.push({ date: key, reason: `Already ${existingStatus}` });
            continue;
        }
        const date = dayStart(key);
        const wasLate = existingStatus === 'LATE'; // read before the row is changed
        await prisma.attendance.upsert({
            where: { userId_date: { userId, date } },
            create: { userId, date, status },
            update: { status },
        });
        marked.push(key);
        if (wasLate) {
            lateMonths.set(key.slice(0, 7), { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
        }
    }
    for (const { year, month } of lateMonths.values()) {
        await reconcileLateDeductions({ userId, year, month });
    }
    return { marked, skipped };
}

/** An OD claim was finally approved (manager AND HR): the employee is On Duty on every day of the claim. */
export function markOdDays({ userId, fromKey, toKey }) {
    return markStatusDays({ userId, fromKey, toKey, status: 'OD' });
}

/**
 * A Work From Home request was finally approved (team lead / manager AND HR): the employee shows as
 * WFH on every working day of the request. An approved OD day or a LATE mark is kept as it is.
 */
export function markWfhDays({ userId, fromKey, toKey }) {
    return markStatusDays({ userId, fromKey, toKey, status: 'WFH', keepStatuses: ['OD', 'LATE'] });
}

// ---------------------------------------------------------------------------
// Shared checks + biometric (fingerprint machine) attendance
// ---------------------------------------------------------------------------

/** Why attendance cannot be recorded on this day (holiday / weekend), or null. */
export async function getNonWorkingBlock(companyId, key) {
    const date = dayStart(key);
    const [holiday, override] = companyId
        ? await Promise.all([
              prisma.holiday.findUnique({ where: { companyId_date: { companyId, date } } }),
              prisma.attendanceOverride.findUnique({ where: { companyId_date: { companyId, date } } }),
          ])
        : [null, null];
    if (override) return null;
    if (holiday) return `Festival holiday: ${holiday.name}`;
    if (WEEKEND_DAYS.includes(weekdayOfKey(key))) return 'Weekend';
    return null;
}

/** First / last punch of a day -> attendance status, times and late deductions. */
export async function applyBiometricDay({ user, key, punchTimes, now = new Date() }) {
    const times = punchTimes.map((t) => new Date(t)).sort((a, b) => a - b);
    if (times.length === 0) return null;

    const first = times[0];
    const last = times[times.length - 1];
    // A second punch a few minutes after the first is a double scan, not a check-out
    const checkOut = last - first >= MIN_CHECKOUT_GAP_MS ? last : null;
    const date = dayStart(key);

    const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId: user.id, date } } });
    const existingStatus = String(existing?.status || '').toUpperCase();

    // WFH / On Duty chosen by the employee stay as they are; times are still recorded
    const status = ['WFH', 'OD'].includes(existingStatus)
        ? existingStatus
        : isAfterOfficeStart(first, OFFICE_START_HOUR, OFFICE_START_MINUTE)
          ? 'LATE'
          : 'PRESENT';

    const attendance = await prisma.attendance.upsert({
        where: { userId_date: { userId: user.id, date } },
        create: { userId: user.id, date, status, checkIn: first, checkOut },
        update: { status, checkIn: first, checkOut },
    });

    let deductions = [];
    if (status === 'LATE' && existingStatus !== 'LATE') {
        const { y, m } = istParts(date);
        const { start, end } = monthRange(y, m);
        const lateCount = await prisma.attendance.count({
            where: { userId: user.id, status: 'LATE', date: { gte: start, lt: end } },
        });
        deductions = await ensureLateDeductions({
            user,
            monthKey: `${y}-${String(m).padStart(2, '0')}`,
            lateCount,
            dateKey: key,
            now,
        });
    }
    return { attendance, status, deductions };
}
