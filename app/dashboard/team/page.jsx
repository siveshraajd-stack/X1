'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageShell } from '@/components/ui/page-shell';
import { LeaveTable } from '@/components/leave/leave-table';
import { LeaveKindFilter, matchesLeaveKind } from '@/components/leave/leave-kind-filter';
import { ExpenseTable } from '@/components/expense/expense-table';
import { AttendanceSummaryTable } from '@/components/attendance/summary-table';

export default function TeamPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const isTeamLead = session?.user?.role === 'TEAM_LEAD';
    const [tab, setTab] = useState('leaves');
    const [kind, setKind] = useState('ALL'); // ALL | ON_LEAVE | WFH | ABSENT

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('tab') === 'profiles') setTab('profiles');
    }, []);
    const [leaves, setLeaves] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [hrNames, setHrNames] = useState([]);
    const [members, setMembers] = useState([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const [leaveRes, expenseRes, memberRes] = await Promise.all([
            fetch('/api/leaves?scope=team'),
            isTeamLead ? Promise.resolve(null) : fetch('/api/expenses?scope=team'),
            fetch('/api/team/members'),
        ]);
        if (leaveRes.ok) {
            const data = await leaveRes.json();
            setLeaves(data.leaves || []);
            if (data.hrNames) setHrNames(data.hrNames);
        }
        if (expenseRes?.ok) setExpenses((await expenseRes.json()).claims || []);
        if (memberRes.ok) setMembers((await memberRes.json()).members || []);
    }, [isTeamLead]);

    useEffect(() => {
        if (status === 'authenticated') {
            if (session.user.role === 'EMPLOYEE') router.replace('/dashboard');
            else load();
        }
    }, [status, session, router, load]);

    // Reload when a request is accepted / denied from the popup or the notification page
    useEffect(() => {
        window.addEventListener('keystone:leave-updated', load);
        return () => window.removeEventListener('keystone:leave-updated', load);
    }, [load]);

    const decide = async (id, statusValue, adminComment) => {
        setError('');
        setMessage('');
        const res = await fetch('/api/leaves', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: statusValue, adminComment }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Failed to update request');
        else setMessage(data.message);
        await load();
    };

    const decideExpense = async (id, statusValue, managerComment) => {
        setError('');
        setMessage('');
        const res = await fetch('/api/expenses', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: statusValue, managerComment }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Failed to update claim');
        else setMessage(data.message);
        await load();
    };

    const pendingExpenses = expenses.filter((c) => c.canDecide).length;

    const tabClass = (id) =>
        `px-5 py-2.5 rounded-full text-xs font-bold transition-all ${tab === id ? 'bg-primary-700 text-white shadow-lift' : 'bg-white/80 text-primary-700 border border-[var(--line)] hover:bg-white'}`;

    return (
        <PageShell title="My Team">
            <div className="max-w-5xl space-y-6">
                <div className="flex gap-2">
                    <button className={tabClass('leaves')} onClick={() => setTab('leaves')}>Leave</button>
                    {!isTeamLead && (
                        <button className={tabClass('expenses')} onClick={() => setTab('expenses')}>
                            Expenses{pendingExpenses > 0 ? ` (${pendingExpenses})` : ''}
                        </button>
                    )}
                    <button className={tabClass('attendance')} onClick={() => setTab('attendance')}>Attendance</button>
                    <button className={tabClass('profiles')} onClick={() => setTab('profiles')}>Profiles</button>
                </div>
                {message && <div className="k-card px-5 py-3 text-sm font-semibold text-secondary-700 !bg-secondary-50">{message}</div>}
                {error && <div className="k-card px-5 py-3 text-sm font-semibold text-red-600 !bg-red-50">{error}</div>}
                {tab === 'leaves' ? (
                    <div className="space-y-4">
                        <LeaveKindFilter leaves={leaves} value={kind} onChange={setKind} />
                        <LeaveTable leaves={leaves.filter((l) => matchesLeaveKind(l, kind))} showEmployee onDecide={decide} hrNames={hrNames} emptyText="No leave requests" />
                    </div>
                ) : tab === 'expenses' && !isTeamLead ? (
                    <ExpenseTable claims={expenses} showEmployee onDecide={decideExpense} hrNames={hrNames} emptyText="No expense claims" />
                ) : tab === 'profiles' ? (
                    members.length === 0 ? (
                        <div className="k-card p-12 text-center text-sm font-semibold text-[var(--ink-soft)]">No employees</div>
                    ) : (
                        <div className="space-y-3">
                            {members.map((m) => (
                                <div key={m.id} className="k-card p-5 flex flex-wrap items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-700 text-white flex items-center justify-center font-bold text-lg shrink-0">
                                        {m.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-sm truncate">{m.name} <span className="text-[11px] text-[var(--ink-soft)] font-semibold">{m.employeeId}</span>{m.role === 'TEAM_LEAD' ? <span className="ml-2 text-[9px] font-bold uppercase tracking-wide text-primary-600 bg-primary-50 rounded-full px-2 py-0.5">Team lead</span> : null}</p>
                                        <p className="text-xs text-[var(--ink-soft)] truncate">
                                            {[m.jobDetails?.jobPosition, m.jobDetails?.department].filter(Boolean).join(' · ') || m.email}
                                        </p>
                                    </div>
                                    <Link href={`/dashboard/team/${m.id}`} className="k-btn">Edit</Link>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <AttendanceSummaryTable emptyText="No employees" />
                )}
            </div>
        </PageShell>
    );
}
