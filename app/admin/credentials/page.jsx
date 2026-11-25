'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/ui/page-shell';

const ROLE_LABEL = { ADMIN: 'HR', MANAGER: 'Manager', TEAM_LEAD: 'Team Lead', EMPLOYEE: 'Employee' };

export default function AdminCredentialsPage() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [visible, setVisible] = useState({}); // userId -> true when the password is shown
    const [copied, setCopied] = useState('');

    const load = useCallback(async () => {
        setError('');
        try {
            const res = await fetch('/api/admin/credentials', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load');
            setAccounts(data.accounts || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return accounts;
        return accounts.filter(
            (a) =>
                a.name.toLowerCase().includes(q) ||
                a.email.toLowerCase().includes(q) ||
                (ROLE_LABEL[a.role] || '').toLowerCase().includes(q)
        );
    }, [accounts, search]);

    const copy = async (id, text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(id);
            setTimeout(() => setCopied(''), 1500);
        } catch {
            window.prompt('Copy:', text);
        }
    };

    return (
        <PageShell admin title="Login Credentials">
            <div className="max-w-5xl space-y-4">
                {error && <div className="p-3 bg-red-600 text-white text-xs font-bold border border-gray-200">{error}</div>}

                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    className="w-full max-w-md px-4 py-3 text-[10px] font-bold border border-gray-200 outline-none placeholder:text-gray-300 bg-white uppercase tracking-wide"
                />

                <div className="bg-white border border-gray-200 shadow-sm overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                                <th className="p-3">Name</th>
                                <th className="p-3">Role</th>
                                <th className="p-3">Email (login)</th>
                                <th className="p-3">Password</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={4} className="p-4 text-gray-400">Loading...</td>
                                </tr>
                            )}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-4 text-gray-400">No accounts found.</td>
                                </tr>
                            )}
                            {filtered.map((a) => (
                                <tr key={a.id} className="border-b border-gray-100">
                                    <td className="p-3 font-bold">{a.name}</td>
                                    <td className="p-3">{ROLE_LABEL[a.role] || a.role}</td>
                                    <td className="p-3">
                                        <span className="font-mono">{a.email}</span>
                                    </td>
                                    <td className="p-3">
                                        {a.password ? (
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono min-w-[110px]">
                                                    {visible[a.id] ? a.password : '••••••••'}
                                                </span>
                                                <button
                                                    onClick={() => setVisible((v) => ({ ...v, [a.id]: !v[a.id] }))}
                                                    className="px-2 py-1 border border-gray-200 text-[10px] font-bold uppercase hover:bg-gray-100"
                                                >
                                                    {visible[a.id] ? 'Hide' : 'Show'}
                                                </button>
                                                <button
                                                    onClick={() => copy(a.id, a.password)}
                                                    className="px-2 py-1 border border-gray-200 text-[10px] font-bold uppercase hover:bg-gray-100"
                                                >
                                                    {copied === a.id ? 'Copied' : 'Copy'}
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">Not stored yet (stored at next login / reset)</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageShell>
    );
}
