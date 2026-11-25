'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EmployeeCard } from '@/components/admin/employee-card';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { formatMinutes } from '@/lib/work-hours';
import { Users, UserCheck, Plane, UserX, Briefcase, Home, Search, Plus } from 'lucide-react';

// Stat tile: a link when it has a destination, a plain box otherwise
function Tile({ href, className, children }) {
    return href ? <Link href={href} className={className}>{children}</Link> : <div className={className}>{children}</div>;
}

export default function HRDashboard() {
    const { data: session } = useSession();
    const router = useRouter();
    const [employees, setEmployees] = useState([]);
    const [stats, setStats] = useState({
        totalEmployees: 0,
        presentToday: 0,
        onLeave: 0,
        onDuty: 0,
        absentToday: 0
    });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [hours, setHours] = useState({});
    // userId -> { loading } | { data } | { error }  (login details are fetched only when HR asks)
    const [creds, setCreds] = useState({});

    const fetchDashboardData = async () => {
        try {
            const [empRes, statsRes, hoursRes] = await Promise.all([
                fetch('/api/admin/employees'),
                fetch('/api/admin/dashboard'),
                fetch('/api/admin/hours')
            ]);

            const empData = await empRes.json();
            const statsData = await statsRes.json();
            const hoursData = await hoursRes.json().catch(() => ({}));

            setEmployees(empData.employees || []);
            setHours(hoursData.hours || {});
            setStats(statsData.stats || {
                totalEmployees: 0,
                presentToday: 0,
                onLeave: 0,
                onDuty: 0,
                absentToday: 0
            });
        } catch (error) {
            console.error('Failed to fetch dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (session) fetchDashboardData();
    }, [session]);

    const showCredentials = async (id) => {
        setCreds((c) => ({ ...c, [id]: { loading: true } }));
        try {
            const res = await fetch(`/api/admin/employees/${id}/credentials`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load');
            setCreds((c) => ({ ...c, [id]: { data: data.credentials } }));
        } catch (error) {
            setCreds((c) => ({ ...c, [id]: { error: error.message } }));
        }
    };

    const hideCredentials = (id) => setCreds((c) => {
        const next = { ...c };
        delete next[id];
        return next;
    });

    // HR sets a new temporary password (the person must change it at next login)
    const resetPassword = async (id) => {
        const password = window.prompt('New temporary password (min 8 characters, 1 uppercase, 1 number, 1 special character):');
        if (!password) return;
        try {
            const res = await fetch(`/api/admin/employees/${id}/credentials`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update password');
            await showCredentials(id);
        } catch (error) {
            window.alert(error.message);
        }
    };

    // Remove an employee (HR only). The server refuses when the person still manages a team.
    const removeEmployee = async (emp) => {
        const ok = window.confirm(`Remove ${emp.name}? Their profile, attendance, leave requests and expense claims will be permanently deleted. This cannot be undone.`);
        if (!ok) return;
        try {
            const res = await fetch(`/api/admin/employees/${emp.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to remove employee');
            await fetchDashboardData();
        } catch (error) {
            window.alert(error.message);
        }
    };

    const filteredEmployees = employees.filter((emp) =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.jobDetails?.department?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const total = Number(stats.totalEmployees) || 0;
    const pct = (n) => (total > 0 ? Math.min(100, Math.round((Number(n) / total) * 100)) : 0);
    const tiles = [
        { label: 'Total employees', value: stats.totalEmployees, icon: Users, grad: 'from-primary-500 to-primary-800', pct: 100 },
        { label: 'Present today', value: stats.presentToday, icon: UserCheck, grad: 'from-secondary-400 to-secondary-700', pct: pct(stats.presentToday), href: '/admin/attendance?view=present' },
        { label: 'On leave', value: stats.onLeave, icon: Plane, grad: 'from-primary-300 to-primary-600', pct: pct(stats.onLeave), href: '/admin/attendance?view=leave' },
        { label: 'On duty (OD)', value: stats.onDuty || 0, icon: Briefcase, grad: 'from-primary-400 to-primary-700', pct: pct(stats.onDuty || 0), href: '/admin/attendance?view=od' },
        { label: 'Work from home', value: stats.workFromHome || 0, icon: Home, grad: 'from-teal-400 to-teal-600', pct: pct(stats.workFromHome || 0), href: '/admin/attendance?view=wfh' },
        { label: 'Absent today', value: stats.absentToday, icon: UserX, grad: 'from-red-400 to-red-600', pct: pct(stats.absentToday), href: '/admin/attendance?view=absent' },
    ];

    return (
        <div className="min-h-screen flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8 lg:p-10 min-w-0">
                {/* Header */}
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4 k-rise">
                    <div>
                        <h1 className="k-title text-4xl md:text-5xl">Employee Management</h1>
                    </div>
                    <Link href="/admin/employees/new" className="k-btn">
                        <Plus className="w-4 h-4" /> Register new employee
                    </Link>
                </header>

                {/* Stat tiles with presence share */}
                <div className="grid grid-cols-2 xl:grid-cols-6 gap-4 mb-8">
                    {tiles.map((t, idx) => (
                        <Tile key={t.label} href={t.href} className={`k-card k-card-hover k-rise p-5 relative overflow-hidden block ${['', 'k-rise-2', 'k-rise-3', 'k-rise-4'][idx] || 'k-rise-4'} ${t.href ? 'cursor-pointer' : ''}`}>
                            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${t.grad} text-white flex items-center justify-center shadow-soft`}>
                                <t.icon className="w-5 h-5" />
                            </div>
                            <p className="mt-4 text-4xl font-bold tracking-tight">{String(t.value).padStart(2, '0')}</p>
                            <p className="k-label mt-1">{t.label}</p>
                            <div className="mt-4 h-1.5 rounded-full bg-primary-100 overflow-hidden" aria-hidden="true">
                                <div className={`h-full rounded-full bg-gradient-to-r ${t.grad}`} style={{ width: `${t.pct}%`, transition: 'width 1s ease' }} />
                            </div>
                        </Tile>
                    ))}
                </div>

                {/* Search */}
                <div className="relative mb-6 max-w-xl">
                    <Search className="w-4 h-4 text-primary-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search by name, email or department"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="k-input !pl-11 !rounded-full shadow-soft"
                    />
                </div>

                {/* Employee Lined Table Layout */}
                <div className="k-card overflow-hidden mb-20 overflow-x-auto !rounded-3xl">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-gradient-to-r from-primary-800 to-primary-600 text-white">
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] ">Entity Name</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px]">DEPARTMENT</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px]">POSITION</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] text-center">Hrs Today</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] text-center">Hrs Week</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] text-center">Hrs Month</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] text-center">Idle Today</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] text-center">Idle Month</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px]">Login Email</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px]">Password</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] text-center">Real Time Status</th>
                                <th className="px-4 py-4 font-bold uppercase tracking-wide text-[10px] text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--line)]">
                            {loading ? (
                                <tr><td colSpan="12" className="px-3 py-24 text-center text-gray-400 font-semibold animate-pulse">Loading workforce data...</td></tr>
                            ) : filteredEmployees.length === 0 ? (
                                <tr><td colSpan="12" className="px-3 py-24 text-center text-gray-400 font-semibold">No matching employees</td></tr>
                            ) : (
                                filteredEmployees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer" onClick={() => router.push(`/admin/employees/${emp.id}`)}>
                                        <td className="px-4 py-4 font-bold text-gray-900">{emp.name}</td>
                                        <td className="px-4 py-4 uppercase text-gray-500">{emp.jobDetails?.department || 'N/A'}</td>
                                        <td className="px-4 py-4 uppercase font-bold tracking-wide">{emp.jobDetails?.jobPosition || 'N/A'}</td>
                                        <td className="px-4 py-4 text-center font-bold">{formatMinutes(hours[emp.id]?.todayMinutes)}</td>
                                        <td className="px-4 py-4 text-center font-bold">{formatMinutes(hours[emp.id]?.weekMinutes)}</td>
                                        <td className="px-4 py-4 text-center font-bold">{formatMinutes(hours[emp.id]?.monthMinutes)}</td>
                                        <td className={`px-4 py-4 text-center font-bold ${(hours[emp.id]?.todayIdleMinutes || 0) > 0 ? 'text-red-600' : ''}`}>{formatMinutes(hours[emp.id]?.todayIdleMinutes)}</td>
                                        <td className="px-4 py-4 text-center font-bold">{formatMinutes(hours[emp.id]?.monthIdleMinutes)}</td>
                                        <td className="px-4 py-4 break-all">{emp.email}</td>
                                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                            {(() => {
                                                const c = creds[emp.id];
                                                const btn = 'rounded-full px-3 py-1 text-[10px] font-bold bg-primary-50 text-primary-700 hover:bg-primary-100';
                                                if (!c) return <button className={btn} onClick={() => showCredentials(emp.id)}>SHOW</button>;
                                                if (c.loading) return <span className="text-gray-400">LOADING...</span>;
                                                if (c.error) return <span className="text-red-500">{c.error}</span>;
                                                return (
                                                    <div className="space-y-1">
                                                        {c.data.password ? (
                                                            <p className="font-mono text-xs font-bold break-all select-all">{c.data.password}</p>
                                                        ) : (
                                                            <p className="text-[8px] font-bold text-gray-400 uppercase">Not stored yet (set before this feature). Use SET NEW.</p>
                                                        )}
                                                        <div className="flex gap-1">
                                                            <button className={btn} onClick={() => hideCredentials(emp.id)}>HIDE</button>
                                                            <button className={btn} onClick={() => resetPassword(emp.id)}>SET NEW</button>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`k-chip ${emp.attendance?.some(a => a.checkIn || a.clockIn)
                                                ? 'bg-secondary-100 text-secondary-700' : 'bg-red-100 text-red-600'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${emp.attendance?.some(a => a.checkIn || a.clockIn) ? 'bg-secondary-500' : 'bg-red-500'}`} />
                                                {emp.attendance?.some(a => a.checkIn || a.clockIn) ? 'Active' : 'Away'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex justify-center gap-1">
                                                <Link href={`/admin/employees/${emp.id}/edit`} className="rounded-full px-3 py-1 text-[10px] font-bold bg-primary-50 text-primary-700 hover:bg-primary-100">EDIT</Link>
                                                <button type="button" onClick={() => removeEmployee(emp)} className="rounded-full px-3 py-1 text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100">REMOVE</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
