'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { EmployeeSidebar } from '@/components/employee/employee-sidebar';
import { HoursSummary } from '@/components/attendance/hours-summary';
import { AttendanceActions } from '@/components/dashboard/attendance-actions';
import { ManagerDashboard } from '@/components/dashboard/manager-dashboard';
import { TeamLeadDashboard } from '@/components/dashboard/team-lead-dashboard';
import { CalendarCheck, CalendarPlus, ClipboardList, Receipt, UserCog, Bell } from 'lucide-react';

export function EmployeeDashboard() {
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [stats, setStats] = useState({ daysWorked: 0 });

    const fetchStats = useCallback(async () => {
        try {
            // This month's attendance (Present + Late + WFH + On Duty count as days worked)
            const attendanceRes = await fetch('/api/attendance/calendar');
            const attendanceData = await attendanceRes.json();
            const s = attendanceData.summary;
            const daysWorked = s ? s.PRESENT + s.LATE + s.WFH + s.OD : 0;

            setStats({ daysWorked });
        } catch (error) {
            console.error('Failed to fetch dashboard stats:', error);
        }
    }, []);

    useEffect(() => {
        if (!userId) return;
        (async () => {
            try {
                const response = await fetch(`/api/admin/employees/${userId}`);
                const data = await response.json();
                setEmployee(data.employee || null);
            } catch (error) {
                console.error('Failed to fetch employee data:', error);
            } finally {
                setLoading(false);
            }
        })();
        (async () => {
            try {
                const res = await fetch('/api/notifications?limit=3');
                const data = await res.json();
                setNotifications(data.notifications || []);
            } catch (error) {
                console.error('Failed to fetch notifications:', error);
            }
        })();
        fetchStats();
        // Clocking in / out changes the days-worked count
        window.addEventListener('attendanceUpdated', fetchStats);
        return () => window.removeEventListener('attendanceUpdated', fetchStats);
    }, [userId, fetchStats]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-sm font-semibold text-[var(--ink-soft)]">Loading...</p>
                </div>
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-[var(--ink-soft)] font-semibold">Not found</p>
            </div>
        );
    }

    const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = employee?.name?.split(' ')[0] || 'there';

    const quickActions = [
        { href: '/dashboard/attendance', title: 'Attendance', icon: CalendarCheck },
        { href: '/dashboard/logs', title: 'My Logs', icon: ClipboardList },
        { href: '/dashboard/time-off', title: 'Leave', icon: CalendarPlus },
        { href: '/dashboard/expenses', title: 'Expense', icon: Receipt },
        { href: '/profile', title: 'Profile', icon: UserCog },
    ];

    return (
        <div className="min-h-screen flex">
            <EmployeeSidebar />

            <main className="flex-1 ml-64 p-8 lg:p-10 min-w-0">
                {/* Hero */}
                <section className="k-rise relative overflow-hidden rounded-[2rem] p-8 lg:p-10 text-white shadow-lift mb-6 k-sidebar">
                    <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-primary-400/30 blur-3xl" />
                    <div className="absolute right-40 -bottom-24 w-64 h-64 rounded-full bg-secondary-400/20 blur-3xl" />
                    <div className="relative flex flex-wrap items-end justify-between gap-8">
                        <div>
                            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/60">
                                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                            </p>
                            <h1 className="mt-3 text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
                                {greeting},<br />
                                <span className="bg-gradient-to-r from-white to-secondary-200 bg-clip-text text-transparent">{firstName}.</span>
                            </h1>
                            <p className="mt-3 text-sm text-white/70">
                                <b className="text-white text-base">{stats.daysWorked}</b> day{stats.daysWorked === 1 ? '' : 's'} worked this month
                            </p>
                        </div>
                        <AttendanceActions />
                    </div>
                </section>

                {/* Hours worked: day / week / month */}
                <section className="mb-6 k-rise k-rise-3">
                    <p className="k-label mb-3">Hours worked</p>
                    <HoursSummary />
                </section>

                {/* Quick actions */}
                <section className="mb-6 k-rise k-rise-4">
                    <p className="k-label mb-3">Quick actions</p>
                    <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                        {quickActions.map((q) => (
                            <Link key={q.href} href={q.href} className="group k-card k-card-hover p-5 block">
                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-700 text-white flex items-center justify-center shadow-soft group-hover:rotate-6 transition-transform">
                                    <q.icon className="w-5 h-5" />
                                </div>
                                <p className="mt-4 font-bold text-sm">{q.title}</p>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Notifications */}
                <section className="grid grid-cols-1 gap-4">
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
                </section>
            </main>
        </div>
    );
}

// One home for every non-HR login: the dashboard that fits the role.
export default function DashboardHome() {
    const { data: session, status } = useSession();

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="inline-block w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }
    if (session?.user?.role === 'MANAGER') return <ManagerDashboard />;
    if (session?.user?.role === 'TEAM_LEAD') return <TeamLeadDashboard />;
    return <EmployeeDashboard />;
}
