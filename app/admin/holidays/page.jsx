'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageShell } from '@/components/ui/page-shell';

const box = 'bg-white border border-gray-200 shadow-sm p-6';
const input = 'px-3 py-2 border border-gray-200 text-xs ';

export default function AdminHolidaysPage() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [data, setData] = useState({ holidays: [], overrides: [] });
    const [holiday, setHoliday] = useState({ date: '', name: '' });
    const [override, setOverride] = useState({ date: '', reason: '' });
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        const res = await fetch(`/api/holidays?year=${year}`);
        if (res.ok) setData(await res.json());
    }, [year]);

    useEffect(() => {
        load();
    }, [load]);

    const call = async (method, url, body, okMessage) => {
        setError('');
        setMessage('');
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        const json = await res.json();
        if (!res.ok) setError(json.error || 'Request failed');
        else setMessage(okMessage);
        await load();
        return res.ok;
    };

    return (
        <PageShell admin title="Holidays">
            <div className="space-y-8 max-w-4xl">
                {message && <div className="p-3 bg-green-600 text-white text-xs font-bold border border-gray-200">{message}</div>}
                {error && <div className="p-3 bg-red-600 text-white text-xs font-bold border border-gray-200">{error}</div>}

                <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold uppercase tracking-wide">Year</label>
                    <input type="number" value={year} min={2000} max={2100} onChange={(e) => setYear(Number(e.target.value) || year)} className={`${input} w-28`} />
                    <button onClick={() => call('POST', '/api/holidays', { kind: 'defaults', year }, 'National holidays added')} className="px-4 py-2 border border-gray-200 text-[10px] font-bold uppercase hover:bg-primary-800 hover:text-white">
                        Add national holidays
                    </button>
                </div>

                <div className={box}>
                    <h3 className="text-sm font-bold uppercase tracking-wide mb-1">Holidays <span className="inline-block w-3 h-3 bg-yellow-300 border border-gray-200 align-middle ml-1" /></h3>
                    <form
                        className="flex flex-wrap gap-2 mb-4"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (await call('POST', '/api/holidays', { kind: 'holiday', ...holiday }, 'Holiday added')) setHoliday({ date: '', name: '' });
                        }}
                    >
                        <input type="date" required value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} className={input} />
                        <input type="text" required minLength={2} maxLength={80} placeholder="Holiday name" value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} className={`${input} flex-1 min-w-[180px]`} />
                        <button className="px-5 py-2 bg-primary-700 text-white text-[10px] font-bold uppercase border border-gray-200">Add</button>
                    </form>
                    <ul className="divide-y divide-gray-200 text-xs">
                        {data.holidays.length === 0 && <li className="py-3 text-gray-400">No holidays for {year}</li>}
                        {data.holidays.map((h) => (
                            <li key={h.id} className="py-2 flex justify-between items-center">
                                <span><span className="mr-3">{h.date}</span><b>{h.name}</b></span>
                                <button onClick={() => call('DELETE', `/api/holidays?kind=holiday&id=${h.id}`, null, 'Holiday removed')} className="text-[10px] font-bold uppercase text-red-600 underline">Remove</button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className={box}>
                    <h3 className="text-sm font-bold uppercase tracking-wide mb-1">Allow attendance <span className="inline-block w-3 h-3 bg-orange-400 border border-gray-200 align-middle ml-1" /></h3>
                    <form
                        className="flex flex-wrap gap-2 mb-4"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (await call('POST', '/api/holidays', { kind: 'override', ...override }, 'Date opened for attendance')) setOverride({ date: '', reason: '' });
                        }}
                    >
                        <input type="date" required value={override.date} onChange={(e) => setOverride({ ...override, date: e.target.value })} className={input} />
                        <input type="text" maxLength={120} placeholder="Reason (optional)" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} className={`${input} flex-1 min-w-[180px]`} />
                        <button className="px-5 py-2 bg-primary-700 text-white text-[10px] font-bold uppercase border border-gray-200">Allow</button>
                    </form>
                    <ul className="divide-y divide-gray-200 text-xs">
                        {data.overrides.length === 0 && <li className="py-3 text-gray-400">No special working days for {year}</li>}
                        {data.overrides.map((o) => (
                            <li key={o.id} className="py-2 flex justify-between items-center">
                                <span><span className="mr-3">{o.date}</span>{o.reason}</span>
                                <button onClick={() => call('DELETE', `/api/holidays?kind=override&id=${o.id}`, null, 'Removed')} className="text-[10px] font-bold uppercase text-red-600 underline">Remove</button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </PageShell>
    );
}
