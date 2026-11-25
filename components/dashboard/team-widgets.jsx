'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatMinutes } from '@/lib/work-hours';
import { expenseCategoryLabel, leaveTypeLabel } from '@/lib/constants';

const fmtDate = (value) =>
    value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '';
const fmtTime = (value) =>
    value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '--:--';
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const STATUS_STYLE = {
    PRESENT: { label: 'Present', dot: 'bg-secondary-500', chip: 'bg-secondary-50 text-secondary-700' },
    LATE: { label: 'Late', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700' },
    WFH: { label: 'WFH', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700' },
    OD: { label: 'On duty', dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700' },
    LEAVE: { label: 'On leave', dot: 'bg-primary-400', chip: 'bg-primary-50 text-primary-700' },
    ABSENT: { label: 'Absent', dot: 'bg-red-500', chip: 'bg-red-50 text-red-600' },
    OFF: { label: 'Day off', dot: 'bg-gray-300', chip: 'bg-gray-100 text-gray-500' },
};

export function StatusChip({ status }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.OFF;
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${s.chip}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span>;
}

/** Big number tile. `href` makes it a link, `tone` colours the number. */
export function StatTile({ label, value, hint, href, tone = '' }) {
    const body = (
        <div className={`k-card p-5 h-full ${href ? 'k-card-hover' : ''}`}>
            <p className="k-label">{label}</p>
            <p className={`mt-2 text-3xl font-bold tracking-tight ${tone}`}>{value}</p>
            {hint ? <p className="mt-1 text-[11px] font-semibold text-[var(--ink-soft)]">{hint}</p> : null}
        </div>
    );
    return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Section({ title, action, children, className = '' }) {
    return (
        <section className={`k-card p-6 ${className}`}>
            <div className="flex items-center justify-between gap-3 mb-4">
                <p className="font-bold">{title}</p>
                {action}
            </div>
            {children}
        </section>
    );
}

const Empty = ({ text }) => <p className="text-sm text-[var(--ink-soft)]">{text}</p>;

/** Today's status split: one bar + legend. */
export function TodayBar({ today }) {
    const parts = [
        ['PRESENT', today.present - today.late],
        ['LATE', today.late],
        ['WFH', today.wfh],
        ['OD', today.od],
        ['LEAVE', today.leave],
        ['ABSENT', today.absent],
    ];
    const total = Math.max(today.total, 1);
    return (
        <div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                {parts.map(([key, n]) => (n > 0 ? <div key={key} className={STATUS_STYLE[key].dot} style={{ width: `${(n / total) * 100}%` }} title={`${STATUS_STYLE[key].label}: ${n}`} /> : null))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {parts.map(([key, n]) => (
                    <span key={key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ink-soft)]">
                        <span className={`w-2 h-2 rounded-full ${STATUS_STYLE[key].dot}`} />{STATUS_STYLE[key].label} {n}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** Everybody in the team with today's status. `showRole` adds a Team Lead tag (manager view). */
export function Roster({ roster, showRole = false, profileHref }) {
    const [filter, setFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const filters = ['ALL', 'PRESENT', 'WFH', 'OD', 'LEAVE', 'ABSENT'];
    const rows = roster.filter((r) => {
        if (filter === 'PRESENT' ? !['PRESENT', 'LATE'].includes(r.status) : filter !== 'ALL' && r.status !== filter) return false;
        const q = search.trim().toLowerCase();
        return !q || r.name.toLowerCase().includes(q) || (r.employeeId || '').toLowerCase().includes(q);
    });
    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
                {filters.map((f) => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${filter === f ? 'bg-primary-700 text-white shadow-lift' : 'bg-white/80 text-primary-700 border border-[var(--line)] hover:bg-white'}`}
                    >
                        {f === 'ALL' ? 'All' : STATUS_STYLE[f].label}
                    </button>
                ))}
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="k-input !w-44 !py-1.5 text-xs ml-auto" />
            </div>
            {rows.length === 0 ? (
                <Empty text="No one here" />
            ) : (
                <ul className="divide-y divide-[var(--line)]">
                    {rows.map((r) => (
                        <li key={r.id} className="py-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                                {r.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold truncate">
                                    {r.name}
                                    {showRole && r.role === 'TEAM_LEAD' ? <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-primary-600 bg-primary-50 rounded-full px-2 py-0.5">Team lead</span> : null}
                                </p>
                                <p className="text-[11px] text-[var(--ink-soft)] truncate">{[r.employeeId, r.position, r.department].filter(Boolean).join(' · ')}</p>
                            </div>
                            <div className="hidden sm:block text-right text-[11px] font-semibold text-[var(--ink-soft)] w-20">
                                <p>IN {fmtTime(r.checkIn)}</p>
                                <p>{formatMinutes(r.weekMinutes)} wk</p>
                            </div>
                            <StatusChip status={r.status} />
                            {profileHref ? <Link href={`${profileHref}/${r.id}`} className="k-btn-ghost !py-1.5 !px-3 text-[11px]">Profile</Link> : null}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** Leave and expense requests waiting for this person, with Approve / Reject right here. */
export function Approvals({ pending, onChanged }) {
    const [busy, setBusy] = useState('');
    const [comment, setComment] = useState({});
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const decide = async (kind, id, status) => {
        setBusy(`${kind}${id}`);
        setError('');
        setMessage('');
        try {
            const url = kind === 'leave' ? '/api/leaves' : '/api/expenses';
            const text = (comment[`${kind}${id}`] || '').trim();
            if (status === 'REJECTED' && !text) {
                setError('Please type a reason in the comment box before denying');
                setBusy('');
                return;
            }
            const body = kind === 'leave' ? { id, status, adminComment: text || undefined } : { id, status, managerComment: text || undefined };
            const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) setError(data.error || 'Could not save the decision');
            else {
                setMessage(data.message || 'Done');
                window.dispatchEvent(new Event('keystone:leave-updated'));
            }
            await onChanged?.();
        } catch (e) {
            setError('Could not save the decision');
        } finally {
            setBusy('');
        }
    };

    const rows = [
        ...pending.leaveItems.map((l) => ({ kind: 'leave', key: `leave${l.id}`, id: l.id, who: l.user?.name, data: l })),
        ...pending.expenseItems.map((c) => ({ kind: 'expense', key: `expense${c.id}`, id: c.id, who: c.user?.name, data: c })),
    ];

    return (
        <div>
            {message ? <p className="mb-3 text-xs font-semibold text-secondary-700 bg-secondary-50 rounded-xl px-3 py-2">{message}</p> : null}
            {error ? <p className="mb-3 text-xs font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p> : null}
            {rows.length === 0 ? (
                <Empty text="Nothing waiting" />
            ) : (
                <ul className="space-y-3">
                    {rows.map((row) => (
                        <li key={row.key} className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold">{row.who}</p>
                                    {row.kind === 'leave' ? (
                                        <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                                            {leaveTypeLabel(row.data.type)} · {fmtDate(row.data.startDate)}{row.data.endDate !== row.data.startDate ? ` – ${fmtDate(row.data.endDate)}` : ''}
                                            {row.data.days ? ` · ${row.data.days} day${row.data.days === 1 ? '' : 's'}` : ''}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                                            Expense · {expenseCategoryLabel(row.data.category)} · {rupees(row.data.amount)}
                                        </p>
                                    )}
                                    {row.kind === 'leave' && row.data.reason ? <p className="text-xs mt-1 text-[var(--ink-soft)] line-clamp-2">{row.data.reason}</p> : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button type="button" className="k-btn !py-1.5 !px-4 text-[11px]" disabled={busy === row.key} onClick={() => decide(row.kind, row.id, 'APPROVED')}>Approve</button>
                                    <button type="button" className="k-btn-ghost !py-1.5 !px-4 text-[11px] !text-red-600" disabled={busy === row.key} onClick={() => decide(row.kind, row.id, 'REJECTED')}>Reject</button>
                                </div>
                            </div>
                            <input
                                value={comment[row.key] || ''}
                                onChange={(e) => setComment((c) => ({ ...c, [row.key]: e.target.value }))}
                                maxLength={300}
                                placeholder="Comment (required when denying)"
                                className="k-input mt-3 !py-1.5 text-xs"
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function UpcomingLeaves({ items }) {
    if (!items.length) return <Empty text="No one is away in the next 2 weeks" />;
    return (
        <ul className="divide-y divide-[var(--line)]">
            {items.map((l) => (
                <li key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{l.name}</p>
                        <p className="text-[11px] text-[var(--ink-soft)]">{leaveTypeLabel(l.type)}</p>
                    </div>
                    <p className="text-xs font-bold text-primary-700 shrink-0">
                        {fmtDate(l.startDate)}{l.endDate !== l.startDate ? ` – ${fmtDate(l.endDate)}` : ''}
                    </p>
                </li>
            ))}
        </ul>
    );
}

export function Holidays({ items }) {
    if (!items.length) return <Empty text="No upcoming holidays" />;
    return (
        <ul className="space-y-2.5">
            {items.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold truncate">{h.name}</p>
                    <p className="text-xs font-bold text-primary-700 shrink-0">{fmtDate(h.date)}</p>
                </li>
            ))}
        </ul>
    );
}

/** Last 7 working days: people in office / WFH / OD. */
export function TrendBars({ trend, total }) {
    const max = Math.max(total, ...trend.map((t) => t.attended), 1);
    return (
        <div className="flex items-end gap-3 h-36">
            {trend.map((t) => (
                <div key={t.key} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
                    <span className="text-[10px] font-bold text-[var(--ink-soft)]">{t.attended}</span>
                    <div
                        className={`w-full rounded-t-xl ${t.isToday ? 'bg-gradient-to-t from-primary-700 to-primary-400' : 'bg-primary-200'}`}
                        style={{ height: `${Math.max(4, (t.attended / max) * 100)}%` }}
                    />
                    <span className="text-[10px] font-bold text-[var(--ink-soft)]">
                        {new Date(`${t.key}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                    </span>
                </div>
            ))}
        </div>
    );
}
