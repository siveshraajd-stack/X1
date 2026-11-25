'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { ExpenseTable } from '@/components/expense/expense-table';

// HR (admin): claims the reporting manager has accepted land here for the final accept / deny.
// HR also sees claims where HR is itself the reporting manager.
export default function AdminExpensesPage() {
    const [claims, setClaims] = useState([]);
    const [hrNames, setHrNames] = useState([]);
    const [filter, setFilter] = useState('ACTION');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const res = await fetch('/api/expenses?scope=team');
        if (res.ok) {
            const data = await res.json();
            setClaims(data.claims || []);
            setHrNames(data.hrNames || []);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const decide = async (id, status, managerComment) => {
        setError('');
        setMessage('');
        const res = await fetch('/api/expenses', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status, managerComment }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Failed to update claim');
        else setMessage(data.message);
        await load();
    };

    const visible = claims.filter((c) => {
        if (filter === 'ACTION' ? !c.canDecide : filter !== 'ALL' && c.status !== filter) return false;
        if (search && !`${c.user?.name} ${c.user?.employeeId}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <PageShell admin title="Expense Claims">
            <div className="max-w-5xl space-y-6">
                <div className="flex flex-wrap gap-2 items-center k-rise">
                    {[
                        ['ACTION', `Needs my decision (${claims.filter((c) => c.canDecide).length})`],
                        ['PENDING', 'With manager'],
                        ['MANAGER_APPROVED', 'Waiting for HR'],
                        ['APPROVED', 'Approved'],
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
                {message && <div className="k-card px-5 py-3 text-sm font-semibold text-secondary-700 !bg-secondary-50">{message}</div>}
                {error && <div className="k-card px-5 py-3 text-sm font-semibold text-red-600 !bg-red-50">{error}</div>}
                <ExpenseTable claims={visible} showEmployee onDecide={decide} hrNames={hrNames} emptyText="No expense claims" />
            </div>
        </PageShell>
    );
}
