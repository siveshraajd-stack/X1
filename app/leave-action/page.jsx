'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LeaveAction() {
    const params = useSearchParams();
    const token = params.get('token');
    const preset = params.get('action');
    const [leave, setLeave] = useState(null);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');
    const [busy, setBusy] = useState(false);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (!token) {
            setError('Invalid link');
            return;
        }
        fetch(`/api/leaves/action?token=${encodeURIComponent(token)}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Invalid link');
                setLeave(data);
            })
            .catch((e) => setError(e.message));
    }, [token]);

    const decide = async (decision) => {
        if (decision === 'reject' && !reason.trim()) {
            setError('Please enter a reason for denying this request');
            return;
        }
        setError('');
        setBusy(true);
        try {
            const res = await fetch('/api/leaves/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, decision, comment: reason }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setDone(data.message);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="w-full max-w-md bg-white border border-gray-200 shadow-sm p-8">
                <h1 className="text-xl font-bold uppercase mb-4">Leave request</h1>
                {error && <p className="p-3 bg-red-600 text-white text-xs font-bold border border-gray-200">{error}</p>}
                {done && <p className="p-3 bg-green-600 text-white text-xs font-bold border border-gray-200">{done}.</p>}
                {leave && !done && (
                    <>
                        <dl className="text-sm space-y-2 mb-6">
                            <div><dt className="text-[10px] font-bold uppercase text-gray-400">Employee</dt><dd className="font-bold">{leave.employee}</dd></div>
                            <div><dt className="text-[10px] font-bold uppercase text-gray-400">Type</dt><dd>{leave.type}</dd></div>
                            <div><dt className="text-[10px] font-bold uppercase text-gray-400">From - To</dt><dd>{leave.startDate} to {leave.endDate} ({leave.days} working day{leave.days === 1 ? '' : 's'})</dd></div>
                            <div><dt className="text-[10px] font-bold uppercase text-gray-400">Reason</dt><dd>{leave.reason || '-'}</dd></div>
                        </dl>
                        <div className="mb-4">
                            <label className="text-[10px] font-bold uppercase text-gray-400 block mb-1">Reason (required to reject)</label>
                            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} className="w-full border border-gray-200 p-2 text-sm" placeholder="Why are you denying this request?" />
                        </div>
                        {preset && <p className="text-[10px] text-gray-500 mb-3 uppercase">You chose to {preset}. Please confirm below.</p>}
                        <div className="flex gap-4">
                            <button disabled={busy} onClick={() => decide('approve')} className="flex-1 bg-green-600 text-white text-xs font-bold py-3 border border-gray-200 uppercase disabled:opacity-50">Approve</button>
                            <button disabled={busy} onClick={() => decide('reject')} className="flex-1 bg-red-600 text-white text-xs font-bold py-3 border border-gray-200 uppercase disabled:opacity-50">Reject</button>
                        </div>
                    </>
                )}
                {!leave && !error && <p className="text-xs text-gray-400">Loading...</p>}
            </div>
        </div>
    );
}

export default function LeaveActionPage() {
    return (
        <Suspense fallback={null}>
            <LeaveAction />
        </Suspense>
    );
}
