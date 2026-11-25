'use client';

import { useState } from 'react';
import Link from 'next/link';

const inputClass =
    'w-full px-4 py-3 border border-gray-200 text-sm outline-none focus:bg-gray-50 transition-all';

export default function ForgotPasswordPage() {
    const [loginId, setLoginId] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!loginId.trim()) return setError('Enter your email or employee ID');

        setLoading(true);
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: loginId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send the password email');
            setMessage(data.message);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="w-full max-w-md bg-white border border-gray-200 shadow-sm p-8">
                <h1 className="text-2xl font-bold uppercase tracking-tight mb-2">Forgot Password</h1>

                {message ? (
                    <div className="space-y-4">
                        <div className="p-3 bg-green-600 text-white text-xs font-bold border border-gray-200" role="status">
                            {message}
                        </div>
                        <p className="text-xs text-gray-500">
                            Check your personal email, then sign in with the temporary password. You will be asked to choose a new password.
                            If nothing arrives, ask HR to check the personal email saved in your profile.
                        </p>
                        <Link
                            href="/auth/login"
                            className="block w-full text-center bg-primary-700 text-white text-xs font-bold py-4 uppercase tracking-wider"
                        >
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-gray-500 mb-6">
                            Enter your work email or employee ID. A temporary password will be sent to the personal email saved in your profile.
                        </p>

                        {error && (
                            <div className="mb-4 p-3 bg-red-600 text-white text-xs font-bold border border-gray-200" role="alert">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wide block mb-1">Email or Employee ID</label>
                                <input
                                    type="text"
                                    name="loginId"
                                    value={loginId}
                                    onChange={(e) => setLoginId(e.target.value)}
                                    className={inputClass}
                                    autoComplete="username"
                                    placeholder="name@kaspl.net"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-primary-700 text-white text-xs font-bold py-4 uppercase tracking-wider disabled:opacity-50"
                            >
                                {loading ? 'Sending...' : 'Send temporary password'}
                            </button>
                        </form>

                        <p className="mt-6 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                            <Link href="/auth/login" className="underline underline-offset-4">Back to sign in</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
