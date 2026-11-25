'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

/** Clock in / clock out card (auto clock-in the first time the dashboard opens on a working day). */
export function AttendanceActions() {
    const { data: session } = useSession();
    const [status, setStatus] = useState({ clockedIn: false, clockedOut: false, clockIn: null, clockOut: null });
    const autoTried = useRef(false);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/attendance?statusOnly=true');
            const data = await res.json();
            setStatus({ clockedIn: data.clockedIn, clockedOut: data.clockedOut, clockIn: data.clockIn, clockOut: data.clockOut });
            return data;
        } catch (err) {
            console.error('Failed to fetch attendance status', err);
        } finally {
            setLoading(false);
        }
    };

    // Clock the employee in automatically the first time the dashboard is opened today
    useEffect(() => {
        if (!session?.user?.id) return;
        (async () => {
            const data = await fetchStatus();
            if (!data || autoTried.current) return;
            autoTried.current = true;
            const alreadyClocked = data.clockedIn || data.clockedOut || data.clockIn;
            if (alreadyClocked) return;
            try {
                const res = await fetch('/api/attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'clockin' }),
                });
                const result = await res.json();
                // Holidays, weekends and approved leave are refused by the server: stay quiet then
                if (res.ok) {
                    if (result.notice) alert(result.notice);
                    await fetchStatus();
                    window.dispatchEvent(new Event('attendanceUpdated'));
                }
            } catch (err) {
                console.error('Auto clock in failed', err);
            }
        })();
    }, [session?.user?.id]);

    const handleAttendance = async (action) => {
        setProcessing(true);
        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (res.ok) {
                if (data.notice) alert(data.notice);
                await fetchStatus();
                // Optionally trigger a custom event to notify UserAvatar
                window.dispatchEvent(new Event('attendanceUpdated'));
            } else {
                alert(data.error || 'Something went wrong');
            }
        } catch (err) {
            console.error('Attendance error', err);
            alert('Failed to process attendance');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <div className="animate-pulse bg-white/10 h-14 w-64 rounded-2xl flex items-center justify-center text-xs font-bold text-white/70">Syncing...</div>;

    const fmtTime = (value) =>
        value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '--:--';

    const working = status.clockedIn && !status.clockedOut;

    let action;
    if (status.clockedOut) {
        action = (
            <div className="rounded-full bg-white/10 px-5 py-3 text-xs font-bold text-white/70">Clocked out</div>
        );
    } else if (status.clockedIn) {
        action = (
            <button
                onClick={() => handleAttendance('clockout')}
                disabled={processing}
                className="rounded-full bg-white text-red-600 px-6 py-3 text-xs font-bold shadow-lift hover:scale-[1.03] active:scale-95 transition-transform disabled:opacity-50"
            >
                {processing ? 'Clocking out...' : 'Clock out'}
            </button>
        );
    } else {
        action = (
            <button
                onClick={() => handleAttendance('clockin')}
                disabled={processing}
                className="rounded-full bg-secondary-400 text-secondary-900 px-6 py-3 text-xs font-bold shadow-lift hover:scale-[1.03] active:scale-95 transition-transform disabled:opacity-50"
            >
                {processing ? 'Clocking in...' : 'Clock in'}
            </button>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-white/10 border border-white/15 backdrop-blur px-5 py-4">
            <div className="flex items-center gap-3">
                <span className={`w-3 h-3 rounded-full ${working ? 'bg-secondary-400 k-live' : 'bg-white/30'}`} />
                <div className="text-[11px] font-bold tracking-wide text-white/60 leading-tight">
                    <p>IN <span className="text-white text-sm font-bold ml-1">{fmtTime(status.clockIn)}</span></p>
                    <p>OUT <span className="text-white text-sm font-bold ml-1">{fmtTime(status.clockOut)}</span></p>
                </div>
            </div>
            {action}
        </div>
    );
}
