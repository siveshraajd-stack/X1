'use client';

import { useEffect, useState } from 'react';

function currentMonthKey() {
    const ist = new Date(Date.now() + 330 * 60 * 1000);
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Present / Absent / Late / WFH / OD counts per employee for a month. */
export function AttendanceSummaryTable({ emptyText = 'No employees found' }) {
    const [month, setMonth] = useState(currentMonthKey());
    const [rows, setRows] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        fetch(`/api/attendance/summary?month=${month}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load summary');
                if (!cancelled) setRows(data.rows);
            })
            .catch((e) => !cancelled && setError(e.message))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [month]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <label className="text-[10px] font-bold uppercase tracking-wide">Month</label>
                <input type="month" value={month} max={currentMonthKey()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="px-3 py-2 border border-gray-200 text-xs " />
            </div>
            {error && <div className="p-3 bg-red-600 text-white text-xs font-bold border border-gray-200">{error}</div>}
            <div className="border border-gray-200 bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
                            <th className="px-4 py-3">Employee</th>
                            <th className="px-4 py-3 text-center">Present</th>
                            <th className="px-4 py-3 text-center">LOP</th>
                            <th className="px-4 py-3 text-center">Late</th>
                            <th className="px-4 py-3 text-center">WFH</th>
                            <th className="px-4 py-3 text-center">OD</th>
                            <th className="px-4 py-3 text-center">Leave</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-xs">
                        {loading && (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{emptyText}</td></tr>
                        )}
                        {!loading && rows.map((r) => (
                            <tr key={r.id}>
                                <td className="px-4 py-3 font-bold">{r.name}<div className="text-[9px] text-gray-400">{r.employeeId}</div></td>
                                <td className="px-4 py-3 text-center text-green-700 font-bold">{r.present}</td>
                                <td className="px-4 py-3 text-center text-red-600 font-bold">{r.absent}</td>
                                <td className="px-4 py-3 text-center text-primary-600 font-bold">{r.late}</td>
                                <td className="px-4 py-3 text-center text-teal-600 font-bold">{r.wfh}</td>
                                <td className="px-4 py-3 text-center text-primary-600 font-bold">{r.od}</td>
                                <td className="px-4 py-3 text-center text-sky-600 font-bold">{r.onLeave}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
