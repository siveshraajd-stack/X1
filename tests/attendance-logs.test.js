import { buildLogRows } from '@/lib/attendance-logs';

const at = (iso) => new Date(iso);

describe('buildLogRows', () => {
    const date = at('2026-03-02T00:00:00+05:30');
    const record = { date, checkIn: at('2026-03-02T09:00:00+05:30'), checkOut: at('2026-03-02T17:30:00+05:30'), clockIn: null, clockOut: null };

    test('one row per day with biometric times and worked hours (breaks removed)', () => {
        const [row] = buildLogRows([record], [], at('2026-03-10T10:00:00+05:30'));
        expect(row.date).toBe('2026-03-02');
        expect(row.checkIn).toBe(record.checkIn.toISOString());
        expect(row.checkOut).toBe(record.checkOut.toISOString());
        expect(row.workedMinutes).toBe(8 * 60 + 30 - 15 - 60 - 15); // 8h30m minus two breaks and lunch
        expect(row.idleSeconds).toBe(0);
    });

    test('web clock times are not shown as biometric', () => {
        const web = { date, checkIn: null, checkOut: null, clockIn: at('2026-03-02T09:00:00+05:30'), clockOut: at('2026-03-02T10:00:00+05:30') };
        const [row] = buildLogRows([web], []);
        expect(row.checkIn).toBeNull();
        expect(row.checkOut).toBeNull();
        expect(row.workedMinutes).toBe(60); // 9:00-10:00 is before the first break
    });

    test('idle episodes add up per day and are listed in time order', () => {
        const episodes = [
            { date, startedAt: at('2026-03-02T14:00:00+05:30'), endedAt: at('2026-03-02T14:20:00+05:30'), idleSeconds: 900 },
            { date, startedAt: at('2026-03-02T11:00:00+05:30'), endedAt: at('2026-03-02T11:10:00+05:30'), idleSeconds: 300 },
        ];
        const [row] = buildLogRows([record], episodes);
        expect(row.idleSeconds).toBe(1200);
        expect(row.idleEpisodes.map((e) => e.seconds)).toEqual([300, 900]);
    });

    test('newest day first, and episodes of a day without attendance still show', () => {
        const other = { date: at('2026-03-03T00:00:00+05:30'), checkIn: null, checkOut: null, clockIn: null, clockOut: null };
        const rows = buildLogRows([record, other], []);
        expect(rows.map((r) => r.date)).toEqual(['2026-03-03', '2026-03-02']);
    });
});
