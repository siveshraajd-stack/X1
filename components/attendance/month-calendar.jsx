'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Yellow = festival holiday and orange = weekend are reserved; attendance uses other colors.
export const STATUS_STYLES = {
    PRESENT: { label: 'Present', bg: 'bg-green-500', text: 'text-white' },
    ABSENT: { label: 'LOP', bg: 'bg-red-500', text: 'text-white' }, // loss of pay (shown instead of "Absent")
    LATE: { label: 'Late', bg: 'bg-primary-500', text: 'text-white' },
    WFH: { label: 'Work From Home', bg: 'bg-teal-500', text: 'text-white' },
    OD: { label: 'On Duty', bg: 'bg-primary-600', text: 'text-white' },
    ON_LEAVE: { label: 'On Leave', bg: 'bg-sky-400', text: 'text-gray-900' },
    HALF_DAY: { label: 'Half Day', bg: 'bg-pink-400', text: 'text-gray-900' },
    HOLIDAY: { label: 'Festival Holiday', bg: 'bg-yellow-300', text: 'text-gray-900' },
    WEEKEND: { label: 'Weekend', bg: 'bg-orange-400', text: 'text-gray-900' },
    PENDING: { label: 'Today (not marked)', bg: 'bg-white border-solid', text: 'text-gray-900' },
    OUTSIDE: { label: '', bg: 'bg-gray-100', text: 'text-gray-300' },
};

const MARK_OPTIONS = ['PRESENT', 'ABSENT', 'LATE', 'WFH', 'OD'];
const LEGEND = ['HOLIDAY', 'WEEKEND', 'PRESENT', 'ABSENT', 'LATE', 'WFH', 'OD', 'ON_LEAVE'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function currentMonthKey() {
    const ist = new Date(Date.now() + 330 * 60 * 1000);
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key, delta) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Month calendar for attendance.
 *  endpoint  - GET url returning { days, summary, today, lateCount, inBlock, blockSize }
 *  editable  - show the one-click marking menu (employee's own calendar)
 *  onChanged - called after a successful mark
 */
export function MonthCalendar({ endpoint, editable = false, onChanged, showLate = true, fill = false }) {
    const [month, setMonth] = useState(currentMonthKey());
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}month=${month}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to load calendar');
            setData(json);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [endpoint, month]);

    useEffect(() => {
        load();
    }, [load]);

    // Mirror of the server rules (the server enforces them again)
    const markState = useCallback(
        (day) => {
            if (!data) return { ok: false, reason: '' };
            if (day.date > data.today) return { ok: false, reason: 'Future days cannot be marked.' };
            if (day.status === 'OUTSIDE') return { ok: false, reason: 'This day is before you joined.' };
            if ((day.holidayName || day.isWeekend) && !day.markingAllowedByAdmin) {
                return { ok: false, reason: `${day.holidayName ? 'Festival holiday' : 'Weekend'}: attendance can be marked only if the admin allows it.` };
            }
            if (day.status === 'ON_LEAVE' && !day.hasRecord) return { ok: false, reason: 'You have approved leave on this day.' };
            if (day.hasRecord && day.status === 'LATE') return { ok: false, reason: 'A late mark is locked. Contact your admin to change it.' };
            if (day.hasRecord && day.date !== data.today) return { ok: false, reason: 'Already marked. Contact your admin to change it.' };
            if (day.date !== data.today && data.today.slice(0, 7) !== day.date.slice(0, 7)) {
                return { ok: false, reason: 'Past days can only be marked within the current month.' };
            }
            return { ok: true, reason: '' };
        },
        [data]
    );

    const mark = async (status) => {
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark', status, date: selected.date }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to mark attendance');
            setSelected(null);
            setNotice(json.notice || '');
            await load();
            onChanged?.(json);
        } catch (e) {
            setSelected(null);
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const cells = useMemo(() => {
        if (!data?.days?.length) return [];
        const pad = data.days[0].weekday;
        return [...Array(pad).fill(null), ...data.days];
    }, [data]);

    const [y, m] = month.split('-').map(Number);
    const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const rows = Math.max(1, Math.ceil(cells.length / 7));

    return (
        <div className={fill ? 'h-full flex flex-col gap-3' : 'space-y-4'}>
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 border border-gray-200 hover:bg-primary-800 hover:text-white" aria-label="Previous month">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold uppercase tracking-wide min-w-[160px] text-center">{title}</span>
                    <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-2 border border-gray-200 hover:bg-primary-800 hover:text-white" aria-label="Next month">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
                {showLate && data && (
                    <div className="px-4 py-2 border border-gray-200 bg-primary-50 text-[10px] font-bold uppercase tracking-wide">
                        Late: {data.inBlock}/{data.blockSize}
                        {data.lateCount > data.blockSize || data.deductedDays > 0 ? (
                            <span className="ml-2 text-gray-500 normal-case ">(total {data.lateCount}, {data.deductedDays} day(s) deducted)</span>
                        ) : null}
                    </div>
                )}
            </div>

            {notice && (
                <div className="p-3 bg-primary-600 text-white text-xs font-bold border border-gray-200 flex justify-between gap-4">
                    <span>{notice}</span>
                    <button onClick={() => setNotice('')} aria-label="Dismiss">✕</button>
                </div>
            )}
            {error && <div className="p-3 bg-red-600 text-white text-xs font-bold border border-gray-200" role="alert">{error}</div>}

            <div className={`border border-gray-200 bg-white p-3 ${fill ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
                <div className="grid grid-cols-7 gap-1 mb-1">
                    {WEEKDAYS.map((d) => (
                        <div key={d} className="text-center text-[9px] font-bold text-gray-400 tracking-wide py-1">{d}</div>
                    ))}
                </div>
                {loading && !data ? (
                    <p className="text-center text-xs text-gray-400 py-12">Loading...</p>
                ) : (
                    <div
                        className={`grid grid-cols-7 gap-1 ${fill ? 'flex-1 min-h-0' : ''}`}
                        style={fill ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : undefined}
                    >
                        {cells.map((day, i) => {
                            if (!day) return <div key={`pad-${i}`} />;
                            const style = STATUS_STYLES[day.status] || STATUS_STYLES.OUTSIDE;
                            const clickable = editable;
                            const isToday = data && day.date === data.today;
                            return (
                                <button
                                    key={day.date}
                                    type="button"
                                    disabled={!clickable}
                                    onClick={() => setSelected(day)}
                                    title={`${day.date}: ${day.note}`}
                                    className={`${fill ? 'w-full h-full' : 'aspect-square sm:aspect-[4/3]'} border ${style.bg} ${style.text} border-gray-200/30 text-xs font-bold flex flex-col items-center justify-center ${clickable ? 'hover:ring-2 hover:ring-primary-600 cursor-pointer' : 'cursor-default'} ${isToday ? 'ring-2 ring-primary-600' : ''}`}
                                >
                                    <span>{Number(day.date.slice(8))}</span>
                                    <span className="hidden sm:block text-[8px] font-normal uppercase truncate max-w-full px-1">
                                        {day.holidayName || (day.status !== 'OUTSIDE' && day.status !== 'PENDING' ? STATUS_STYLES[day.status]?.label.split(' ')[0] : '')}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className={`flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-wider ${fill ? 'shrink-0' : ''}`}>
                {LEGEND.map((key) => (
                    <span key={key} className="flex items-center gap-2">
                        <span className={`w-4 h-4 border border-gray-200 ${STATUS_STYLES[key].bg}`} />
                        {key === 'HOLIDAY' ? 'Holiday' : STATUS_STYLES[key].label}
                    </span>
                ))}
            </div>

            {data?.summary && (
                <div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 text-center ${fill ? 'shrink-0' : ''}`}>
                    {['PRESENT', 'ABSENT', 'LATE', 'WFH', 'OD', 'ON_LEAVE'].map((k) => (
                        <div key={k} className="border border-gray-200 p-2">
                            <p className="text-lg font-bold">{data.summary[k]}</p>
                            <p className="text-[8px] font-bold uppercase text-gray-500">{STATUS_STYLES[k].label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* One-click marking menu */}
            {selected && (
                <div className="fixed inset-0 z-50 bg-primary-700/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
                    <div className="bg-white border border-gray-200 shadow-sm w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{selected.date}</p>
                        <p className="text-sm font-bold uppercase mb-1">{STATUS_STYLES[selected.status]?.label || 'Day'}</p>
                        <p className="text-[10px] text-gray-500 mb-4">{selected.note}</p>
                        {markState(selected).ok ? (
                            <div className="space-y-2">
                                {MARK_OPTIONS.map((status) => (
                                    <button
                                        key={status}
                                        disabled={saving}
                                        onClick={() => mark(status)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 border border-gray-200 text-[10px] font-bold uppercase tracking-wide hover:bg-primary-800 hover:text-white disabled:opacity-50`}
                                    >
                                        <span className={`w-4 h-4 border border-gray-200 ${STATUS_STYLES[status].bg}`} />
                                        {STATUS_STYLES[status].label}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs font-bold text-red-600">{markState(selected).reason}</p>
                        )}
                        <button onClick={() => setSelected(null)} className="mt-4 w-full text-[10px] font-bold uppercase underline">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
