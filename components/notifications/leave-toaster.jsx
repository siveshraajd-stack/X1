'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bell, Check, X } from 'lucide-react';

// WhatsApp-style popups in the bottom-right corner of the screen.
//  - checks for new notifications every few seconds
//  - leave requests that wait for YOUR decision show Accept / Deny buttons right in the popup
//  - when the browser window is not in front, a desktop (system) notification is shown too
const POLL_MS = 5000;
const MAX_BACKLOG = 4; // after login, show at most this many already-waiting notifications
const MAX_VISIBLE = 5;
const AUTO_HIDE_MS = 12000;
const RESULT_HIDE_MS = 4000;

export const LEAVE_UPDATED_EVENT = 'keystone:leave-updated';

function readSeen(key) {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(key) || '[]'));
    } catch {
        return new Set();
    }
}

function writeSeen(key, set) {
    try {
        sessionStorage.setItem(key, JSON.stringify([...set].slice(-200)));
    } catch {
        /* storage not available: popups may repeat after a reload, nothing else */
    }
}

function showDesktopNotification(n) {
    try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        if (!document.hidden && document.hasFocus()) return; // window is in front: the popup is enough
        const note = new Notification(n.title, { body: n.message, icon: '/favicon.png', tag: n.id });
        note.onclick = () => {
            window.focus();
            if (n.actionUrl) window.location.href = n.actionUrl;
            note.close();
        };
    } catch {
        /* desktop notifications are optional */
    }
}

function ToastCard({ toast, onClose, onOpen, onDecide }) {
    const actionable = Boolean(toast.leaveCanDecide) && !toast.result;

    // Information popups fade away by themselves. Popups that wait for a decision stay until answered.
    useEffect(() => {
        if (actionable) return undefined;
        const timer = setTimeout(() => onClose(toast.id), toast.result ? RESULT_HIDE_MS : AUTO_HIDE_MS);
        return () => clearTimeout(timer);
    }, [actionable, toast.id, toast.result, onClose]);

    return (
        <div className="k-toast-in pointer-events-auto overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-700 text-white">
                    <Bell className="h-5 w-5" />
                </div>
                <button type="button" onClick={() => onOpen(toast)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-bold text-gray-900">{toast.title}</p>
                    {toast.senderName && <p className="mt-0.5 truncate text-[11px] font-bold text-primary-700">From: {toast.senderName}</p>}
                    <p className="mt-0.5 break-words text-xs leading-relaxed text-gray-600">{toast.message}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Just now</p>
                </button>
                <button
                    type="button"
                    onClick={() => onClose(toast.id)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {toast.error && <p className="px-4 pb-2 text-xs font-semibold text-red-600">{toast.error}</p>}
            {toast.result && <p className="px-4 pb-3 text-xs font-bold text-secondary-700">{toast.result}</p>}

            {actionable && (
                <div className="flex gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <button
                        type="button"
                        disabled={toast.busy}
                        onClick={() => onDecide(toast, 'APPROVED')}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary-600 px-4 py-2 text-xs font-bold text-white hover:bg-secondary-700 disabled:opacity-50"
                    >
                        <Check className="h-4 w-4" /> Accept
                    </button>
                    <button
                        type="button"
                        disabled={toast.busy}
                        onClick={() => onDecide(toast, 'REJECTED')}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" /> Deny
                    </button>
                </div>
            )}
        </div>
    );
}

export function LeaveToaster() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname() || '';
    const [toasts, setToasts] = useState([]);
    const [mounted, setMounted] = useState(false);
    const seenRef = useRef(new Set());
    const startedRef = useRef(false);
    const userId = session?.user?.id;
    const seenKey = `keystone:seen-notifications:${userId}`;
    const onAuthPage = pathname.startsWith('/auth') || pathname.startsWith('/leave-action');

    useEffect(() => setMounted(true), []);

    const patchToast = useCallback((id, changes) => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
    }, []);

    const closeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const poll = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications?unreadOnly=true&limit=10', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            const list = data.notifications || []; // newest first
            const seen = seenRef.current;

            const fresh = list.filter((n) => !seen.has(n.id));
            const firstRun = !startedRef.current;
            startedRef.current = true;
            fresh.forEach((n) => seen.add(n.id));
            if (fresh.length) writeSeen(seenKey, seen);
            const show = (firstRun ? fresh.slice(0, MAX_BACKLOG) : fresh).reverse(); // oldest first, newest at the bottom

            setToasts((prev) => {
                // keep the Accept / Deny buttons in sync with what is happening to the request
                let changed = false;
                const synced = prev.map((t) => {
                    const latest = list.find((n) => n.id === t.id);
                    if (latest && !t.result && Boolean(latest.leaveCanDecide) !== Boolean(t.leaveCanDecide)) {
                        changed = true;
                        return { ...t, leaveCanDecide: latest.leaveCanDecide };
                    }
                    return t;
                });
                if (!show.length && !changed) return prev; // nothing new: no re-render
                return [...synced, ...show].slice(-MAX_VISIBLE);
            });
            if (!firstRun) show.forEach(showDesktopNotification);
        } catch {
            /* offline or server restarting: try again on the next tick */
        }
    }, [seenKey]);

    useEffect(() => {
        if (status !== 'authenticated' || !userId || onAuthPage) return undefined;
        seenRef.current = readSeen(seenKey);
        startedRef.current = false;
        poll();
        const timer = setInterval(poll, POLL_MS);
        return () => clearInterval(timer);
    }, [status, userId, onAuthPage, seenKey, poll]);

    useEffect(() => {
        if (status === 'unauthenticated') setToasts([]);
    }, [status]);

    // Ask once (on the first click) so the browser allows desktop notifications.
    useEffect(() => {
        if (status !== 'authenticated' || typeof Notification === 'undefined' || Notification.permission !== 'default') {
            return undefined;
        }
        const ask = () => {
            try {
                Notification.requestPermission();
            } catch {
                /* ignore */
            }
        };
        window.addEventListener('click', ask, { once: true });
        return () => window.removeEventListener('click', ask);
    }, [status]);

    const markRead = (id) =>
        fetch('/api/notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        }).catch(() => {});

    const open = (toast) => {
        markRead(toast.id);
        closeToast(toast.id);
        if (toast.actionUrl) router.push(toast.actionUrl);
    };

    const decide = async (toast, decision) => {
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
        patchToast(toast.id, { busy: true, error: '' });
        try {
            const res = await fetch('/api/leaves', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: toast.leaveId, status: decision, adminComment }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const decidedAlready = res.status === 409 || res.status === 403;
                patchToast(toast.id, {
                    busy: false,
                    error: data.error || 'Could not update this request',
                    ...(decidedAlready ? { leaveCanDecide: false } : {}),
                });
                return;
            }
            markRead(toast.id);
            patchToast(toast.id, {
                busy: false,
                leaveCanDecide: false,
                result: data.message || (decision === 'APPROVED' ? 'Accepted' : 'Denied'),
            });
            window.dispatchEvent(new Event(LEAVE_UPDATED_EVENT));
        } catch {
            patchToast(toast.id, { busy: false, error: 'Network error. Please try again.' });
        }
    };

    if (!mounted || onAuthPage || status !== 'authenticated' || toasts.length === 0) return null;

    return createPortal(
        <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3"
        >
            {toasts.map((toast) => (
                <ToastCard
                    key={toast.id}
                    toast={toast}
                    onClose={closeToast}
                    onOpen={open}
                    onDecide={decide}
                />
            ))}
        </div>,
        document.body
    );
}
