'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageShell } from '@/components/ui/page-shell';

const STATUS_CLASS = {
    APPLIED: 'bg-green-100 text-green-700',
    UNMAPPED: 'bg-red-100 text-red-700',
    IGNORED: 'bg-gray-200 text-gray-700',
};

const fmt = (value) =>
    new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

export default function AdminBiometricPage() {
    const [data, setData] = useState({ punches: [], counts: {}, configured: true });
    const [filter, setFilter] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const res = await fetch(`/api/biometric/punches${filter ? `?status=${filter}` : ''}`);
        const json = await res.json();
        if (!res.ok) setError(json.error || 'Failed to load punches');
        else setData(json);
    }, [filter]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <PageShell admin title="Biometric">
            <div className="space-y-6">
                {!data.configured && (
                    <div className="p-3 bg-yellow-100 border border-gray-200 text-xs font-bold">
                        BIOMETRIC_API_KEY is not set in the server .env, so the machine cannot send punches yet.
                    </div>
                )}
                {error && <div className="p-3 bg-red-600 text-white text-xs font-bold border border-gray-200">{error}</div>}

                <div className="flex flex-wrap gap-2 items-center">
                    {[['', 'ALL'], ['APPLIED', 'APPLIED'], ['UNMAPPED', 'UNKNOWN ID'], ['IGNORED', 'IGNORED']].map(([value, label]) => (
                        <button key={label} onClick={() => setFilter(value)} className={`px-4 py-2 text-[10px] font-bold uppercase border border-gray-200 ${filter === value ? 'bg-primary-700 text-white' : 'bg-white'}`}>
                            {label} {value ? `(${data.counts[value] || 0})` : ''}
                        </button>
                    ))}
                    <button onClick={load} className="px-4 py-2 text-[10px] font-bold uppercase border border-gray-200 bg-white hover:bg-primary-800 hover:text-white">Refresh</button>
                </div>

                <div className="border border-gray-200 bg-white shadow-sm overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
                                <th className="px-4 py-3">Punch time (IST)</th>
                                <th className="px-4 py-3">Device user id</th>
                                <th className="px-4 py-3">Employee</th>
                                <th className="px-4 py-3">Device</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Note</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-xs">
                            {data.punches.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No punches yet</td></tr>
                            )}
                            {data.punches.map((p) => (
                                <tr key={p.id}>
                                    <td className="px-4 py-3 ">{fmt(p.punchTime)}</td>
                                    <td className="px-4 py-3 font-bold">{p.biometricId}</td>
                                    <td className="px-4 py-3">{p.user ? `${p.user.name} (${p.user.employeeId})` : <span className="text-red-600 font-bold">Unknown</span>}</td>
                                    <td className="px-4 py-3 text-gray-500">{p.deviceId || '-'}</td>
                                    <td className="px-4 py-3"><span className={`px-2 py-1 text-[9px] font-bold uppercase ${STATUS_CLASS[p.status] || 'bg-gray-100'}`}>{p.status}</span></td>
                                    <td className="px-4 py-3 text-gray-500">{p.reason || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageShell>
    );
}
