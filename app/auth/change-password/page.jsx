'use client';

import { useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const RULES = [
    { label: 'At least 8 characters', test: (v) => v.length >= 8 },
    { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
    { label: 'One number', test: (v) => /[0-9]/.test(v) },
    { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const inputClass =
    'w-full px-4 py-3 border border-gray-200 text-sm outline-none focus:bg-gray-50 transition-all';

export default function ChangePasswordPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const forced = Boolean(session?.user?.mustChangePassword);
    const home = session?.user?.role === 'ADMIN' ? '/admin' : '/dashboard';

    const change = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Frontend validation (the server validates again)
        if (!form.oldPassword) return setError('Old password is required');
        const failed = RULES.find((r) => !r.test(form.newPassword));
        if (failed) return setError(`New password: ${failed.label.toLowerCase()} required`);
        if (form.newPassword === form.oldPassword) return setError('New password must be different from the old password');
        if (form.newPassword !== form.confirmPassword) return setError("Passwords don't match");

        setLoading(true);
        try {
            const res = await fetch('/api/account/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to change password');

            // Refresh the session token (the server re-reads mustChangePassword from the DB)
            await update();
            // Hard navigation so the route guard sees the refreshed cookie
            window.location.assign(home);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="w-full max-w-md bg-white border border-gray-200 shadow-sm p-8">
                <h1 className="text-2xl font-bold uppercase tracking-tight mb-2">Change Password</h1>
                <p className="text-xs text-gray-500 mb-6">
                    {forced
                        ? 'You are using a temporary password. Set a new password to continue.'
                        : 'Choose a new password for your account.'}
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-600 text-white text-xs font-bold border border-gray-200" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-wide block mb-1">Old Password</label>
                        <input type="password" name="oldPassword" value={form.oldPassword} onChange={change} className={inputClass} autoComplete="current-password" required />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-wide block mb-1">New Password</label>
                        <input type="password" name="newPassword" value={form.newPassword} onChange={change} className={inputClass} autoComplete="new-password" required />
                        <ul className="mt-2 grid grid-cols-2 gap-1">
                            {RULES.map((r) => (
                                <li key={r.label} className={`text-[10px] ${r.test(form.newPassword) ? 'text-green-600' : 'text-gray-400'}`}>
                                    {r.test(form.newPassword) ? '✓' : '•'} {r.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-wide block mb-1">Confirm Password</label>
                        <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={change} className={inputClass} autoComplete="new-password" required />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary-700 text-white text-xs font-bold py-4 uppercase tracking-wider border border-gray-200 hover:bg-white hover:text-gray-900 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : 'Change Password'}
                    </button>
                </form>

                <div className="mt-6 flex justify-between text-[10px] font-bold uppercase tracking-wide">
                    {forced ? (
                        <button type="button" onClick={() => signOut({ callbackUrl: '/auth/login' })} className="underline">
                            Sign out
                        </button>
                    ) : (
                        <Link href={home} className="underline">
                            ← Back
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
