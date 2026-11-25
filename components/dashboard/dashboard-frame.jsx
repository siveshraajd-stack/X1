'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { EmployeeSidebar } from '@/components/employee/employee-sidebar';
import { HoursSummary } from '@/components/attendance/hours-summary';
import { LeaveBalance } from '@/components/leave/leave-balance';
import { AttendanceActions } from '@/components/dashboard/attendance-actions';
import { CalendarCheck, CalendarPlus, Receipt, UserCog, Bell, Users } from 'lucide-react';

/** Sidebar + greeting hero with the clock in / out card. Used by the Manager and Team Lead dashboards. */
export function DashboardFrame({ roleLabel, children }) {
    const { data: session } = useSession();
    const [daysWorked, setDaysWorked] = useState(0);

    const loadDays = useCallback(async () => {
        try {
            const res = await fetch('/api/attendance/calendar');
            const data = await res.json();
            const s = data.summary;
            setDaysWorked(s ? s.PRESENT + s.LATE + s.WFH + s.OD : 0);
        } catch (e) {
            console.error('Failed to fetch days worked', e);
        }
    }, []);

    useEffect(() => {
        loadDays();
        window.addEventListener('attendanceUpdated', loadDays);
        return () => window.removeEventListener('attendanceUpdated', loadDays);
    }, [loadDays]);

    const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = session?.user?.name?.split(' ')[0] || 'there';

    return (
        <div className="min-h-screen flex">
            <EmployeeSidebar />
            <main className="flex-1 ml-64 p-8 lg:p-10 min-w-0">
                <section className="k-rise relative overflow-hidden rounded-[2rem] p-8 lg:p-10 text-white shadow-lift mb-6 k-sidebar">
                    <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-primary-400/30 blur-3xl" />
                    <div className="absolute right-40 -bottom-24 w-64 h-64 rounded-full bg-secondary-400/20 blur-3xl" />
                    <div className="relative flex flex-wrap items-end justify-between gap-8">
                        <div>
                            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/60">
                                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                                {' · '}{roleLabel}
                            </p>
                            <h1 className="mt-3 text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                                {greeting},<br />
                                <span className="bg-gradient-to-r from-white to-secondary-200 bg-clip-text text-transparent">{firstName}.</span>
                            </h1>
                            <p className="mt-3 text-sm text-white/70">
                                <b className="text-white text-base">{daysWorked}</b> day{daysWorked === 1 ? '' : 's'} worked this month
                            </p>
                        </div>
                        <AttendanceActions />
                    </div>
                </section>
                {children}
            </main>
        </div>
    );
}

/** My own leave balance, hours, shortcuts and latest notifications. */
export function MyWork({ hideExpense = false }) {
    const [balance, setBalance] = useState(null);
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/leaves');
                const data = await res.json();
                setBalance(data.balance || null);
            } catch (e) {
                console.error('Failed to fetch leave balance', e);
            }
            try {
                const res = await fetch('/api/notifications?limit=4');
                const data = await res.json();
                setNotifications(data.notifications || []);
            } catch (e) {
                console.error('Failed to fetch notifications', e);
            }
        })();
    }, []);

    const quick = [
        { href: '/dashboard/attendance', title: 'Attendance', icon: CalendarCheck },
        { href: '/dashboard/time-off', title: 'Leave', icon: CalendarPlus },
        ...(hideExpense ? [] : [{ href: '/dashboard/expenses', title: 'Expense', icon: Receipt }]),
        { href: '/dashboard/team', title: 'Team', icon: Users },
        { href: '/profile', title: 'Profile', icon: UserCog },
    ];

    return (
        <div className="space-y-6">
            <div>
                <p className="k-label mb-3">My leave balance</p>
                <LeaveBalance balance={balance} />
            </div>
            <div>
                <p className="k-label mb-3">My hours</p>
                <HoursSummary />
            </div>
            <div>
                <p className="k-label mb-3">Quick actions</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {quick.map((q) => (
                        <Link key={q.href} href={q.href} className="group k-card k-card-hover p-5 block">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-700 text-white flex items-center justify-center shadow-soft group-hover:rotate-6 transition-transform">
                                <q.icon className="w-5 h-5" />
                            </div>
                            <p className="mt-4 font-bold text-sm">{q.title}</p>
                        </Link>
                    ))}
                </div>
            </div>
            <div className="k-card p-6">
                <div className="flex justify-between items-center mb-4">
                    <p className="font-bold inline-flex items-center gap-2"><Bell className="w-4 h-4 text-primary-500" /> Notifications</p>
                    <Link href="/dashboard/notifications" className="text-xs font-bold text-primary-600 hover:underline">View all</Link>
                </div>
                {notifications.length === 0 ? (
                    <p className="text-sm text-[var(--ink-soft)]">No notifications</p>
                ) : (
                    <ol className="relative border-l-2 border-primary-100 ml-2 space-y-4">
                        {notifications.map((n) => (
                            <li key={n.id} className="pl-5 relative">
                                <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ring-4 ring-white ${n.isRead ? 'bg-gray-300' : 'bg-primary-500'}`} />
                                <p className="text-sm font-bold">{n.title}</p>
                                <p className="text-xs text-[var(--ink-soft)] mt-0.5">{n.message}</p>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}
