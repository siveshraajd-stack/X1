import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { markAttendance } from '@/lib/attendance-core';
import { dayKey, dayStart, monthRange, normalizeDayKey, parseMonthKey } from '@/lib/dates';
import { netWorkMs } from '@/lib/work-hours';

// POST
//   { action: 'clockin' | 'clockout' }                      "Clock In / Clock Out" buttons on the dashboard
//   (the older names 'checkin' / 'checkout' still work). Biometric Check In / Check Out
//   come only from the fingerprint machine (POST /api/biometric/punches).
//   { action: 'mark', status, date? }                       calendar menu (PRESENT/ABSENT/LATE/WFH/OD)
export async function POST(request) {
    try {
        const user = await requireUser();
        const body = await request.json();
        const { action } = body;
        const now = new Date();

        if (action === 'clockin' || action === 'checkin') {
            const existing = await prisma.attendance.findUnique({
                where: { userId_date: { userId: user.id, date: dayStart(now) } },
            });
            if (existing?.clockIn) throw new AppError('Already clocked in today', 400);

            // The day was already started (e.g. biometric check-in or WFH/OD): keep its
            // status and only record the web clock-in time.
            if (existing && String(existing.status || '').toUpperCase() !== 'ABSENT') {
                const updated = await prisma.attendance.update({ where: { id: existing.id }, data: { clockIn: now } });
                return NextResponse.json({ message: 'Clocked in successfully', attendance: updated, status: updated.status });
            }

            const result = await markAttendance({ user, status: 'PRESENT', now });
            return NextResponse.json({ message: 'Clocked in successfully', ...result });
        }

        if (action === 'clockout' || action === 'checkout') {
            const attendance = await prisma.attendance.findUnique({
                where: { userId_date: { userId: user.id, date: dayStart(now) } },
            });
            if (!attendance || !attendance.clockIn) throw new AppError('Please clock in first', 400);
            if (attendance.clockOut) throw new AppError('Already clocked out today', 400);
            const updated = await prisma.attendance.update({
                where: { id: attendance.id },
                data: { clockOut: now },
            });
            return NextResponse.json({ message: 'Clocked out successfully', attendance: updated });
        }

        if (action === 'mark') {
            const result = await markAttendance({ user, status: body.status, targetKey: body.date, now });
            return NextResponse.json({ message: 'Attendance marked', ...result });
        }

        throw new AppError('Invalid action', 400);
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to process attendance');
        return NextResponse.json(body, { status });
    }
}

// GET attendance records
//   ?statusOnly=true            today's state for the logged in user
//   ?month=YYYY-MM              records of a month
//   ?date=YYYY-MM-DD            records of a day
//   ?userId=...&search=...      admin filters
export async function GET(request) {
    try {
        const user = await requireUser();
        const isAdmin = user.role === 'ADMIN';
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const statusOnly = searchParams.get('statusOnly') === 'true';
        const search = searchParams.get('search');

        if (statusOnly) {
            const attendance = await prisma.attendance.findUnique({
                where: { userId_date: { userId: user.id, date: dayStart(new Date()) } },
            });
            return NextResponse.json({
                // web Clock In / Clock Out
                clockedIn: !!(attendance && attendance.clockIn && !attendance.clockOut),
                clockedOut: !!(attendance && attendance.clockOut),
                clockIn: attendance?.clockIn || null,
                clockOut: attendance?.clockOut || null,
                // biometric Check In / Check Out (from the machine)
                checkIn: attendance?.checkIn || null,
                checkOut: attendance?.checkOut || null,
                // kept for older components
                checkedIn: !!(attendance && (attendance.clockIn || attendance.checkIn) && !(attendance.clockOut || attendance.checkOut)),
                checkedOut: !!(attendance && (attendance.clockOut || attendance.checkOut)),
                status: attendance?.status || null,
                attendance,
            });
        }

        if (!isAdmin && userId && userId !== user.id) throw new AppError('Unauthorized', 401);

        const where = {};
        if (isAdmin) {
            where.user = { companyId: user.companyId };
            if (userId) where.userId = userId;
            if (search) {
                where.user = {
                    companyId: user.companyId,
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { employeeId: { contains: search, mode: 'insensitive' } },
                    ],
                };
            }
        } else {
            where.userId = user.id;
        }

        const dateStr = searchParams.get('date');
        const monthStr = searchParams.get('month');
        if (dateStr) {
            const key = normalizeDayKey(dateStr);
            if (!key) throw new AppError('Invalid date. Use YYYY-MM-DD', 400);
            where.date = { gte: dayStart(key), lt: dayStart(new Date(dayStart(key).getTime() + 36 * 3600 * 1000)) };
        } else if (monthStr) {
            const parsed = parseMonthKey(monthStr);
            if (!parsed) throw new AppError('Invalid month. Use YYYY-MM', 400);
            const { start, end } = monthRange(parsed.year, parsed.month);
            where.date = { gte: start, lt: end };
        }

        const attendance = await prisma.attendance.findMany({
            where,
            include: { user: { select: { name: true, employeeId: true } } },
            orderBy: { date: 'desc' },
        });

        const formatted = attendance.map((record) => {
            let workHours = 0;
            let extraHours = 0;
            // Biometric times are the reference; web clock times are the fallback
            const inTime = record.checkIn || record.clockIn;
            const outTime = record.checkOut || record.clockOut;
            if (inTime && outTime) {
                const diff = netWorkMs(new Date(inTime).getTime(), new Date(outTime).getTime()) / (1000 * 60 * 60); // unpaid breaks excluded
                workHours = Math.floor(diff * 100) / 100;
                if (workHours > 8) extraHours = Math.floor((workHours - 8) * 100) / 100;
            }
            return { ...record, dateKey: dayKey(record.date), workHours: workHours.toFixed(1), extraHours: extraHours.toFixed(1) };
        });

        return NextResponse.json({ attendance: formatted });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch attendance');
        return NextResponse.json(body, { status });
    }
}
