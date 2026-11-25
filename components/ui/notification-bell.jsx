'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell } from 'lucide-react';

export function NotificationBell() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifications = async () => {
        if (!session) return;
        try {
            const res = await fetch('/api/notifications');
            if (res.ok) {
                const data = await res.json();
                setUnreadCount(data.unreadCount);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 10000); // Check every 10 seconds
        window.addEventListener('keystone:leave-updated', fetchNotifications);
        return () => {
            clearInterval(interval);
            window.removeEventListener('keystone:leave-updated', fetchNotifications);
        };
    }, [session]);

    // Re-fetch when user navigates away from notifications page
    useEffect(() => {
        if (!pathname.includes('notifications')) {
            fetchNotifications();
        }
    }, [pathname]);

    const notificationPath = session?.user?.role === 'ADMIN' ? '/admin/notifications' : '/dashboard/notifications';

    return (
        <Link
            href={notificationPath}
            aria-label="Notifications"
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all bg-white/10 hover:bg-white/20 relative group shrink-0"
        >
            <Bell className="w-[18px] h-[18px] transition-colors text-white/70 group-hover:text-white" />
            {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-secondary-500 ring-2 ring-primary-900 text-[10px] text-white font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </Link>
    );
}
