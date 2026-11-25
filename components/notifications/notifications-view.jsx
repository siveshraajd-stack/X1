'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Bell, Check, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';
import { LEAVE_UPDATED_EVENT } from '@/components/notifications/leave-toaster';

const json = { 'Content-Type': 'application/json' };

// Notification page shared by the staff portal and the HR dashboard.
// Leave requests that wait for your decision have Accept / Deny buttons right here.
export function NotificationsView({ admin = false }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [results, setResults] = useState({}); // notificationId -> { ok, text }

    const role = session?.user?.role;

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/auth/login');
        else if (status === 'authenticated') {
            if (admin && role !== 'ADMIN') router.push('/dashboard');
            else if (!admin && role === 'ADMIN') router.push('/admin/notifications');
        }
    }, [status, role, admin, router]);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications?limit=50', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (status !== 'authenticated') return undefined;
        load();
        const timer = setInterval(load, 10000);
        window.addEventListener(LEAVE_UPDATED_EVENT, load);
        return () => {
            clearInterval(timer);
            window.removeEventListener(LEAVE_UPDATED_EVENT, load);
        };
    }, [status, load]);

    const markAsRead = async (id) => {
        const res = await fetch('/api/notifications', { method: 'PATCH', headers: json, body: JSON.stringify({ id }) });
        if (res.ok) setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    };

    const markAllAsRead = async () => {
        const res = await fetch('/api/notifications', { method: 'PATCH', headers: json, body: JSON.stringify({ markAll: true }) });
        if (res.ok) setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    };

    const remove = async (id) => {
        const res = await fetch(`/api/notifications?notificationId=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (res.ok) setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    const removeAll = async () => {
        if (!window.confirm('Delete all messages? This cannot be undone.')) return;
        const res = await fetch('/api/notifications?all=true', { method: 'DELETE' });
        if (res.ok) {
            setNotifications([]);
            setResults({});
        }
    };

    const decide = async (n, decision) => {
        let adminComment;
        if (decision === 'REJECTED') {
            const answer = window.prompt('Reason for denying (required):');
            if (answer === null) return; // cancelled: do not deny
            if (!answer.trim()) {
                window.alert('A reason is required to deny a request.');
                return;
            }
            adminComment = answer.trim().slice(0, 300);
        }
        setBusyId(n.id);
        try {
            const res = await fetch('/api/leaves', {
                method: 'PATCH',
                headers: json,
                body: JSON.stringify({ id: n.leaveId, status: decision, adminComment }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                await markAsRead(n.id);
                setResults((prev) => ({ ...prev, [n.id]: { ok: true, text: data.message || 'Done' } }));
                window.dispatchEvent(new Event(LEAVE_UPDATED_EVENT));
            } else {
                setResults((prev) => ({ ...prev, [n.id]: { ok: false, text: data.error || 'Could not update this request' } }));
            }
            await load();
        } catch {
            setResults((prev) => ({ ...prev, [n.id]: { ok: false, text: 'Network error. Please try again.' } }));
        } finally {
            setBusyId(null);
        }
    };

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="inline-block w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
        );
    }
    if (status !== 'authenticated') return null;

    const unread = notifications.filter((n) => !n.isRead).length;

    return (
        <PageShell admin={admin} title="Notifications">
            <div className="max-w-4xl space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <span className="k-chip bg-white/70 border border-[var(--line)] text-primary-700">{unread} unread</span>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={markAllAsRead} disabled={unread === 0} className="k-btn disabled:opacity-50">
                            <Check className="w-4 h-4" /> Mark all read
                        </button>
                        <button onClick={removeAll} disabled={notifications.length === 0} className="k-btn !bg-red-600 hover:!bg-red-700 disabled:opacity-50">
                            <Trash2 className="w-4 h-4" /> Delete all
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="k-card p-12 text-center text-sm font-semibold text-[var(--ink-soft)]">Loading...</div>
                ) : notifications.length === 0 ? (
                    <div className="k-card p-12 text-center">
                        <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-[var(--ink-soft)]">No notifications</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map((n) => {
                            const result = results[n.id];
                            return (
                                <article key={n.id} className={`k-card p-5 relative ${n.isRead ? '' : 'ring-1 ring-primary-300'}`}>
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary-400 to-primary-700 text-white flex items-center justify-center">
                                            <Bell className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />}
                                                <p className="text-sm font-bold truncate">{n.title}</p>
                                            </div>
                                            {n.senderName && (
                                                <p className="mt-0.5 text-[11px] font-bold text-primary-700">From: {n.senderName}</p>
                                            )}
                                            <p className="mt-1 text-sm break-words">{n.message}</p>
                                            <p className="mt-1.5 text-[11px] text-[var(--ink-soft)]">{new Date(n.createdAt).toLocaleString()}</p>

                                            {n.leaveCanDecide && !result?.ok && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button
                                                        disabled={busyId === n.id}
                                                        onClick={() => decide(n, 'APPROVED')}
                                                        className="px-5 py-1.5 rounded-full bg-secondary-600 hover:bg-secondary-700 text-white text-xs font-bold disabled:opacity-50"
                                                    >
                                                        Accept
                                                    </button>
                                                    <button
                                                        disabled={busyId === n.id}
                                                        onClick={() => decide(n, 'REJECTED')}
                                                        className="px-5 py-1.5 rounded-full bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold disabled:opacity-50"
                                                    >
                                                        Deny
                                                    </button>
                                                </div>
                                            )}
                                            {result && (
                                                <p className={`mt-2 text-xs font-bold ${result.ok ? 'text-secondary-700' : 'text-red-600'}`}>{result.text}</p>
                                            )}
                                            {!n.leaveCanDecide && n.leaveStatus && n.type === 'LEAVE_ACTION' && !result && (
                                                <p className="mt-2 text-xs font-semibold text-[var(--ink-soft)]">
                                                    {n.leaveStatus === 'REJECTED'
                                                        ? 'This request was denied.'
                                                        : n.leaveStatus === 'APPROVED'
                                                          ? 'This request was accepted.'
                                                          : 'This request has moved on to the next step.'}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 gap-1">
                                            {!n.isRead && (
                                                <button
                                                    onClick={() => markAsRead(n.id)}
                                                    aria-label="Mark as read"
                                                    className="p-2 rounded-full hover:bg-primary-50 text-primary-700"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => remove(n.id)}
                                                aria-label="Delete notification"
                                                className="p-2 rounded-full hover:bg-red-50 text-red-500"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </PageShell>
    );
}
