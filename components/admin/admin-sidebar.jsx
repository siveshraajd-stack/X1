'use client';

import { Users, Clock, Shield, Receipt, CalendarDays, LineChart, Fingerprint, Lock } from 'lucide-react';
import { AppSidebar } from '@/components/ui/app-sidebar';

const navigationItems = [
    { name: 'Employees', href: '/admin', icon: Users },
    { name: 'Attendance', href: '/admin/attendance', icon: Clock },
    { name: 'Biometric', href: '/admin/biometric', icon: Fingerprint },
    { name: 'Leave Request', href: '/admin/time-off', icon: Shield },
    { name: 'Expense Claims', href: '/admin/expenses', icon: Receipt },
    { name: 'Holidays', href: '/admin/holidays', icon: CalendarDays },
    { name: 'Analytics', href: '/admin/analytics', icon: LineChart },
    { name: 'Login Credentials', href: '/admin/credentials', icon: Lock },
];

export function AdminSidebar() {
    return <AppSidebar items={navigationItems} portalLabel="HR DASHBOARD" profileHref="/admin/profile" />;
}
