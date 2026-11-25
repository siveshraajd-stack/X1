'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMinutes } from '@/lib/work-hours';

// Total hours worked today / this week (Mon-Sun) / this month for the logged in user.
// Refreshes when the dashboard clocks the user in or out.
export function HoursSummary({ endpoint = '/api/attendance/hours' }) {
    const [totals, setTotals] = useState(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error('Request failed');
            setTotals(await res.json());
            setFailed(false);
        } catch (error) {
            console.error('Failed to fetch hours worked', error);
            setFailed(true);
        }
    }, [endpoint]);

    useEffect(() => {
        load();
        window.addEventListener('attendanceUpdated', load);
        return () => window.removeEventListener('attendanceUpdated', load);
    }, [load]);

    const cards = [
        { label: 'Today', value: totals?.todayMinutes, accent: 'from-secondary-400 to-secondary-600' },
        { label: 'This week', value: totals?.weekMinutes, accent: 'from-primary-300 to-primary-600' },
        { label: 'This month', value: totals?.monthMinutes, accent: 'from-primary-500 to-primary-800' },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cards.map((card) => (
                <div key={card.label} className="k-card k-card-hover p-6 relative overflow-hidden">
                    <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${card.accent} opacity-20 blur-sm`} />
                    <p className="k-label">{card.label}</p>
                    <p className="mt-3 text-4xl font-bold tracking-tight">
                        {failed ? '--' : totals ? formatMinutes(card.value) : '...'}
                    </p>
                    <div className={`mt-4 h-1.5 w-12 rounded-full bg-gradient-to-r ${card.accent}`} />
                </div>
            ))}
        </div>
    );
}
