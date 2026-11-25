'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { LeaveTable } from '@/components/leave/leave-table';
import { LeaveKindFilter, matchesLeaveKind } from '@/components/leave/leave-kind-filter';

export default function AdminTimeOffPage() {
    const [leaves, setLeaves] = useState([]);
    const [hrNames, setHrNames] = useState([]);
    const [filter, setFilter] = useState('MANAGER_APPROVED');
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState('ALL'); // ALL | ON_LEAVE | WFH | OD
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const res = await fetch('/api/leaves');
        if (res.ok) {
            const data = await res.json();
            setLeaves(data.leaves || []);
            setHrNames(data.hrNames || []);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Reload when a request is accepted / denied from the popup or the notification page
    useEffect(() => {
        window.addEventListener('keystone:leave-updated', load);
        return () => window.removeEventListener('keystone:leave-updated', load);
    }, [load]);

    const decide = async (id, status, adminComment) => {
        setError('');
        setMessage('');
        const res = await fetch('/api/leaves', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status, adminComment }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Failed to update request');
        else setMessage(data.message);
        await load();
    };

    const visible = leaves.filter((l) => {
        if (filter !== 'ALL' && l.status !== filter) return false;
        if (!matchesLeaveKind(l, kind)) return false;
        if (search && !`${l.user?.name} ${l.user?.employeeId}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <PageShell admin title="Leave Requests">
            <div className="space-y-6">
                <div className="flex flex-wrap gap-2 items-center k-rise">
                    {[
                        ['MANAGER_APPROVED', 'Awaiting HR'],
                        ['APPROVED', 'Accepted'],
                        ['REJECTED', 'Rejected'],
                        ['ALL', 'All'],
                    ].map(([f, text]) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                                filter === f ? 'bg-primary-700 text-white shadow-lift' : 'bg-white/80 text-primary-700 border border-[var(--line)] hover:bg-white'
                            }`}
                        >
                            {text}
                        </button>
                    ))}
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee" className="k-input !w-56 !py-2" />
                </div>
                <LeaveKindFilter leaves={leaves.filter((l) => filter === 'ALL' || l.status === filter)} value={kind} onChange={setKind} hideAbsent />
                {message && <div className="k-card px-5 py-3 text-sm font-semibold text-secondary-700 !bg-secondary-50">{message}</div>}
                {error && <div className="k-card px-5 py-3 text-sm font-semibold text-red-600 !bg-red-50">{error}</div>}
                <LeaveTable leaves={visible} showEmployee showManager onDecide={decide} hrNames={hrNames} emptyText="No requests found" />
            </div>
        </PageShell>
    );
}
