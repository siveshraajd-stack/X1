'use client';

import { useEffect, useId, useState } from 'react';
import { HeartPulse, Coffee } from 'lucide-react';

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const PALETTE = {
    SICK: { label: 'Sick leave', from: '#4dba7e', to: '#1c6e41', soft: 'bg-secondary-50 text-secondary-700', icon: HeartPulse },
    CASUAL: { label: 'Casual leave', from: '#bf9ed0', to: '#643a78', soft: 'bg-primary-50 text-primary-700', icon: Coffee },
};

/** One radial gauge: the arc shows what is LEFT of the yearly quota. */
function Gauge({ kind, data, pending = 0 }) {
    const uid = useId().replace(/:/g, '');
    const [ready, setReady] = useState(false);
    const meta = PALETTE[kind];
    const Icon = meta.icon;
    const allowance = data?.allowance ?? 0;
    const remaining = data?.remaining ?? 0;
    const used = data?.used ?? 0;
    const fraction = allowance > 0 ? Math.min(1, remaining / allowance) : 0;

    useEffect(() => {
        const t = setTimeout(() => setReady(true), 60);
        return () => clearTimeout(t);
    }, []);

    const offset = ready ? CIRCUMFERENCE * (1 - fraction) : CIRCUMFERENCE;

    return (
        <div className="k-card k-card-hover p-5 flex items-center gap-5">
            <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" role="img" aria-label={`${meta.label}: ${remaining} of ${allowance} days left`}>
                    <defs>
                        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={meta.from} />
                            <stop offset="100%" stopColor={meta.to} />
                        </linearGradient>
                    </defs>
                    <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="9" className="k-ring-track" />
                    <circle
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="none"
                        strokeWidth="9"
                        strokeLinecap="round"
                        stroke={`url(#g-${uid})`}
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={offset}
                        className="k-ring-bar"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold leading-none tracking-tight">{remaining}</span>
                    <span className="text-[10px] font-bold text-[var(--ink-soft)] mt-1">of {allowance} left</span>
                </div>
            </div>
            <div className="min-w-0">
                <span className={`k-chip ${meta.soft}`}>
                    <Icon className="w-3.5 h-3.5" /> {meta.label}
                </span>
                <p className="mt-3 text-sm font-semibold">
                    {used} used
                    {pending > 0 && <span className="text-[var(--ink-soft)] font-medium"> · {pending} pending</span>}
                </p>
            </div>
        </div>
    );
}

/** Sick (8) + Casual (8) yearly balances. `balance` is the object returned by GET /api/leaves. */
export function LeaveBalance({ balance }) {
    if (!balance?.sick || !balance?.casual) return null;
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Gauge kind="SICK" data={balance.sick} pending={balance.pending?.sick} />
            <Gauge kind="CASUAL" data={balance.casual} pending={balance.pending?.casual} />
        </div>
    );
}
