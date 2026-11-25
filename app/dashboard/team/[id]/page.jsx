'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PageShell } from '@/components/ui/page-shell';

const FIELDS = [
    ['phone', 'Phone', 'text'],
    ['dateOfBirth', 'Date of Birth', 'date'],
    ['gender', 'Gender', 'select', ['Male', 'Female', 'Other']],
    ['maritalStatus', 'Marital Status', 'select', ['Single', 'Married', 'Divorced', 'Widowed']],
    ['nationality', 'Nationality', 'text'],
    ['department', 'Department', 'text'],
    ['jobPosition', 'Job Position', 'text'],
    ['workLocation', 'Work Location', 'text'],
    ['residingAddress', 'Address', 'textarea'],
];

export default function EditTeamMemberPage() {
    const { id } = useParams();
    const router = useRouter();
    const { data: session, status } = useSession();
    const [name, setName] = useState('');
    const [form, setForm] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (status !== 'authenticated') return;
        if (!['MANAGER', 'TEAM_LEAD'].includes(session.user.role)) return router.replace('/dashboard');
        (async () => {
            const res = await fetch(`/api/profile/${id}`);
            const data = await res.json();
            if (!res.ok) return setError(data.error || 'Failed to load');
            setName(data.user?.name || '');
            setForm({
                phone: data.user?.phone || '',
                dateOfBirth: data.profile?.dateOfBirth ? new Date(data.profile.dateOfBirth).toISOString().slice(0, 10) : '',
                gender: data.profile?.gender || '',
                maritalStatus: data.profile?.maritalStatus || '',
                nationality: data.profile?.nationality || '',
                department: data.jobDetails?.department || '',
                jobPosition: data.jobDetails?.jobPosition || '',
                workLocation: data.jobDetails?.workLocation || '',
                residingAddress: data.profile?.residingAddress || '',
            });
        })();
    }, [status, session, id, router]);

    const change = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (form.phone && !/^[0-9]{10}$/.test(form.phone.trim())) return setError('Phone must be 10 digits');
        setSaving(true);
        try {
            const res = await fetch(`/api/profile/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, phone: form.phone.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save');
            router.push('/dashboard/team?tab=profiles');
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <PageShell title={name || 'Edit'} showDate={false}>
            {!form ? (
                <p className={`text-sm font-semibold ${error ? 'text-red-600' : 'text-[var(--ink-soft)]'}`}>{error || 'Loading...'}</p>
            ) : (
                <form onSubmit={submit} className="k-card p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                    {error && <div className="md:col-span-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold px-4 py-3" role="alert">{error}</div>}
                    {FIELDS.map(([key, label, type, options]) => (
                        <div key={key} className={type === 'textarea' ? 'md:col-span-2' : ''}>
                            <label className="k-label block mb-1.5">{label}</label>
                            {type === 'select' ? (
                                <select name={key} value={form[key]} onChange={change} className="k-input">
                                    <option value="">Select</option>
                                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                            ) : type === 'textarea' ? (
                                <textarea name={key} value={form[key]} onChange={change} rows={3} className="k-input" />
                            ) : (
                                <input type={type} name={key} value={form[key]} onChange={change} className="k-input" />
                            )}
                        </div>
                    ))}
                    <div className="md:col-span-2 flex gap-3">
                        <button type="submit" disabled={saving} className="k-btn">{saving ? 'Saving...' : 'Save'}</button>
                        <button type="button" onClick={() => router.back()} className="k-btn !bg-white !text-primary-700 border border-[var(--line)]">Cancel</button>
                    </div>
                </form>
            )}
        </PageShell>
    );
}
