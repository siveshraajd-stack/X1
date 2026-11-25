import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { AppError, errorResponseParts } from '@/lib/errors';
import { dayKey, dayStart, normalizeDayKey } from '@/lib/dates';
import { defaultHolidays } from '@/lib/default-holidays';

// GET /api/holidays?year=YYYY  - holidays + "attendance allowed" dates of the company
export async function GET(request) {
    try {
        const user = await requireUser();
        const { searchParams } = new URL(request.url);
        const year = Number(searchParams.get('year')) || Number(dayKey().slice(0, 4));
        const range = { gte: dayStart(`${year}-01-01`), lt: dayStart(`${year + 1}-01-01`) };

        const [holidays, overrides] = await Promise.all([
            prisma.holiday.findMany({ where: { companyId: user.companyId, date: range }, orderBy: { date: 'asc' } }),
            prisma.attendanceOverride.findMany({ where: { companyId: user.companyId, date: range }, orderBy: { date: 'asc' } }),
        ]);

        return NextResponse.json({
            year,
            holidays: holidays.map((h) => ({ id: h.id, date: dayKey(h.date), name: h.name })),
            overrides: overrides.map((o) => ({ id: o.id, date: dayKey(o.date), reason: o.reason })),
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to fetch holidays');
        return NextResponse.json(body, { status });
    }
}

// POST (admin)
//   { kind: 'holiday', date, name }     add a festival / public holiday
//   { kind: 'override', date, reason? } allow attendance marking on a holiday / weekend date
//   { kind: 'defaults', year }          add the fixed-date national holidays of a year
export async function POST(request) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const body = await request.json();
        const companyId = admin.companyId;

        if (body.kind === 'defaults') {
            const year = Number(body.year);
            if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError('Invalid year', 400);
            const result = await prisma.holiday.createMany({
                data: defaultHolidays([year]).map((h) => ({ companyId, date: h.date, name: h.name })),
                skipDuplicates: true,
            });
            return NextResponse.json({ message: `${result.count} holidays added` }, { status: 201 });
        }

        const key = normalizeDayKey(body.date);
        if (!key) throw new AppError('Invalid date. Use YYYY-MM-DD', 400);
        const date = dayStart(key);

        if (body.kind === 'holiday') {
            const name = String(body.name || '').trim();
            if (name.length < 2) throw new AppError('Holiday name is required', 400);
            if (name.length > 80) throw new AppError('Holiday name is too long', 400);
            const exists = await prisma.holiday.findUnique({ where: { companyId_date: { companyId, date } } });
            if (exists) throw new AppError('A holiday already exists on this date', 409);
            const holiday = await prisma.holiday.create({ data: { companyId, date, name } });
            return NextResponse.json({ holiday: { id: holiday.id, date: key, name } }, { status: 201 });
        }

        if (body.kind === 'override') {
            const reason = String(body.reason || '').trim().slice(0, 120) || null;
            const override = await prisma.attendanceOverride.upsert({
                where: { companyId_date: { companyId, date } },
                create: { companyId, date, reason },
                update: { reason },
            });
            return NextResponse.json({ override: { id: override.id, date: key, reason } }, { status: 201 });
        }

        throw new AppError("kind must be 'holiday', 'override' or 'defaults'", 400);
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to save');
        return NextResponse.json(body, { status });
    }
}

// DELETE /api/holidays?kind=holiday|override&id=...  (admin)
export async function DELETE(request) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        const { searchParams } = new URL(request.url);
        const kind = searchParams.get('kind');
        const id = searchParams.get('id');
        if (!id) throw new AppError('id is required', 400);

        const model = kind === 'holiday' ? prisma.holiday : kind === 'override' ? prisma.attendanceOverride : null;
        if (!model) throw new AppError("kind must be 'holiday' or 'override'", 400);

        // Scoped to the admin's company so ids from other companies cannot be removed
        const result = await model.deleteMany({ where: { id, companyId: admin.companyId } });
        if (result.count === 0) throw new AppError('Not found', 404);
        return NextResponse.json({ message: 'Deleted' });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to delete');
        return NextResponse.json(body, { status });
    }
}
