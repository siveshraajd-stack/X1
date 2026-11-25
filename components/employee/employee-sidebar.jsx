'use client';

import { useSession } from 'next-auth/react';
import { LayoutDashboard, Clock, Calendar, Receipt, Users, ClipboardList } from 'lucide-react';
import { AppSidebar } from '@/components/ui/app-sidebar';
import { IdleMonitor } from '@/components/dashboard/idle-monitor';

const navigationItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Attendance', href: '/dashboard/attendance', icon: Clock },
    { name: 'Leave Request', href: '/dashboard/time-off', icon: Calendar },
    { name: 'Expense Claim', href: '/dashboard/expenses', icon: Receipt },
];

// Managers and team leads also approve leave and see their team's attendance
// Only employees have a personal log (biometric times + idle time)
const logsItem = { name: 'My Logs', href: '/dashboard/logs', icon: ClipboardList };

const managerItems = [{ name: 'Team', href: '/dashboard/team', icon: Users }];
const PORTAL_LABEL = { MANAGER: 'MANAGER PORTAL', TEAM_LEAD: 'TEAM LEAD PORTAL' };

export function EmployeeSidebar() {
    const { data: session } = useSession();
    const role = session?.user?.role;
    // Team leads have no expense claim in their portal
    const base = role === 'TEAM_LEAD' ? navigationItems.filter((i) => i.href !== '/dashboard/expenses') : navigationItems;
    const withLogs = role === 'EMPLOYEE' ? [...base.slice(0, 2), logsItem, ...base.slice(2)] : base;
    const items = [...withLogs, ...(['MANAGER', 'TEAM_LEAD'].includes(role) ? managerItems : [])];

    return (
        <>
            {/* Invisible: records cursor inactivity for the employee's My Logs page */}
            {role === 'EMPLOYEE' ? <IdleMonitor /> : null}
            <AppSidebar
                items={items}
                portalLabel={PORTAL_LABEL[role] || 'STAFF PORTAL'}
                profileHref="/profile"
            />
        </>
    );
}
