'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

/**
 * "Name" section for HR, managers and team leads.
 * Employees get every notification / email / approval "from" this name, so it has to be a real one.
 * The personal email is where "Forgot password" sends the temporary password.
 */
export function StaffNameSection({ onSaved }) {
    const { update } = useSession();
    const [form, setForm] = useState({ name: '', personalEmail: '' });
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/account/profile');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setForm({ name: data.name || '', personalEmail: data.personalEmail || '' });
            } finally {
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const change = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const save = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        if (form.name.trim().length < 2) return setError('Name must be at least 2 characters');
        setSaving(true);
        try {
            const res = await fetch('/api/account/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: form.name, personalEmail: form.personalEmail }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save');
            setForm({ name: data.name, personalEmail: data.personalEmail });
            setMessage('Saved. Your name now shows on everything you send to employees.');
            await update(); // refresh the name in the session
            onSaved?.(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="k-card p-6">
            <p className="k-label mb-4">Name</p>
            {!loaded ? (
                <p className="text-sm font-semibold text-[var(--ink-soft)]">Loading...</p>
            ) : (
                <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                    {error && <div className="md:col-span-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold px-4 py-3" role="alert">{error}</div>}
                    {message && <div className="md:col-span-2 rounded-xl bg-secondary-50 text-secondary-700 text-sm font-semibold px-4 py-3" role="status">{message}</div>}
                    <div>
                        <label className="k-label block mb-1.5" htmlFor="staff-name">Your name <span className="text-red-500">*</span></label>
                        <input id="staff-name" name="name" value={form.name} onChange={change} maxLength={80} className="k-input" required />
                        <p className="mt-1.5 text-[11px] text-[var(--ink-soft)]">Notifications and approvals sent to employees come from this name.</p>
                    </div>
                    <div>
                        <label className="k-label block mb-1.5" htmlFor="staff-personal-email">Personal email</label>
                        <input id="staff-personal-email" type="email" name="personalEmail" value={form.personalEmail} onChange={change} className="k-input" placeholder="yourname@gmail.com" />
                        <p className="mt-1.5 text-[11px] text-[var(--ink-soft)]">"Forgot password" sends the temporary password here.</p>
                    </div>
                    <div className="md:col-span-2">
                        <button type="submit" disabled={saving} className="k-btn">{saving ? 'Saving...' : 'Save'}</button>
                    </div>
                </form>
            )}
        </section>
    );
}
