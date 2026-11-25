'use client';

import { useState } from 'react';

export function BulkUpload() {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const upload = async (e) => {
        e.preventDefault();
        if (!file) return setError('Choose an Excel file');
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/admin/employees/bulk', { method: 'POST', body: fd });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Upload failed');
            setResult(json);
            setFile(null);
            e.target.reset();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto mb-10 bg-white border border-gray-200 shadow-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-bold uppercase tracking-wide">Upload Excel</h2>
                <a href="/api/admin/employees/bulk" className="text-[10px] font-bold uppercase tracking-wide underline">
                    Download template
                </a>
            </div>
            <form onSubmit={upload} className="flex flex-wrap items-center gap-3">
                <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="flex-1 min-w-[200px] text-xs border border-gray-200 p-2"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-3 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wide disabled:opacity-50"
                >
                    {loading ? 'Uploading...' : 'Upload'}
                </button>
            </form>
            {error && <div className="mt-4 p-3 bg-red-600 text-white text-xs font-bold" role="alert">{error}</div>}
            {result && (
                <div className="mt-4">
                    <p className="text-xs font-bold mb-2">
                        {result.created} created{result.failed ? `, ${result.failed} failed` : ''}
                    </p>
                    <div className="border border-gray-200 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-[9px] uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th className="px-3 py-2">Row</th>
                                    <th className="px-3 py-2">Name</th>
                                    <th className="px-3 py-2">Email</th>
                                    <th className="px-3 py-2">Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.results.map((r) => (
                                    <tr key={`${r.row}-${r.email}`} className="border-t border-gray-100">
                                        <td className="px-3 py-2">{r.row}</td>
                                        <td className="px-3 py-2">{r.name}</td>
                                        <td className="px-3 py-2 break-all">{r.email}</td>
                                        <td className={`px-3 py-2 font-bold ${r.ok ? 'text-green-600' : 'text-red-600'}`}>
                                            {r.ok ? (
                                                <>
                                                    {r.employeeId} · <span className="font-mono select-all">{r.password}</span>
                                                </>
                                            ) : (
                                                r.error
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
