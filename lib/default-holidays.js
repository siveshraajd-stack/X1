import { dayStart } from '@/lib/dates';

// Fixed-date Indian national holidays. Movable festivals (Pongal, Holi, Eid,
// Diwali ...) change every year, so the admin adds those from Admin > Holidays.
const FIXED = [
    ['01-01', "New Year's Day"],
    ['01-26', 'Republic Day'],
    ['05-01', 'Labour Day'],
    ['08-15', 'Independence Day'],
    ['10-02', 'Gandhi Jayanti'],
    ['12-25', 'Christmas'],
];

export function defaultHolidays(years) {
    const list = years || [new Date().getFullYear(), new Date().getFullYear() + 1];
    return list.flatMap((year) => FIXED.map(([md, name]) => ({ date: dayStart(`${year}-${md}`), name })));
}
