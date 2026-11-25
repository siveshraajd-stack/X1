'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';

/** Employee picks their team leader from the list of team leaders. Leave requests go to this person first. */
export function TeamLeaderCard() {
    const [leads, setLeads] = useState([]);
    const [current, setCurrent] = useState(null);
    const [selected, setSelected] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/account/team-lead', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not load team leaders');
            setLeads(data.teamLeads || []);
            setCurrent(data.current || null);
            setSelected(data.current?.id || '');
            setError('');
        } catch (e) {
            setError(e.message || 'Could not load team leaders');
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const save = async () => {
        if (!selected) return setError('Please select a team leader');
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const res = await fetch('/api/account/team-lead', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ managerId: selected }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not change team leader');
            setCurrent(data.current);
            setMessage(data.message);
        } catch (e) {
            setError(e.message || 'Could not change team leader');
        } finally {
            setSaving(false);
        }
    };

    // The current manager may not be a team lead (set by HR): keep showing them so the box is never blank
    const currentIsListed = current && leads.some((l) => l.id === current.id);
    const unchanged = !selected || selected === current?.id;

    return (
        <div className="k-card p-6">
            <p className="font-bold inline-flex items-center gap-2 mb-1"><UserCheck className="w-4 h-4 text-primary-500" /> My team leader</p>
            <p className="text-xs text-[var(--ink-soft)] mb-4">
                Current: <b>{current?.name || 'Not assigned'}</b>. Your leave requests go to your team leader first, then the manager, then HR.
            </p>
            {error ? <p className="mb-3 text-xs font-semibold text-red-600 bg-red-50 rounded-xl px-3 py-2" role="alert">{error}</p> : null}
            {message ? <p className="mb-3 text-xs font-semibold text-secondary-700 bg-secondary-50 rounded-xl px-3 py-2">{message}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
                <select
                    value={selected}
                    onChange={(e) => { setSelected(e.target.value); setMessage(''); setError(''); }}
                    className="k-input !w-auto min-w-[240px] flex-1 max-w-sm"
                    disabled={!loaded || saving}
                    aria-label="Team leader"
                >
                    <option value="">{loaded ? (leads.length ? 'Select team leader' : 'No team leaders available') : 'Loading...'}</option>
                    {current && !currentIsListed ? <option value={current.id}>{current.name} (current)</option> : null}
                    {leads.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}{l.employeeId ? ` (${l.employeeId})` : ''}</option>
                    ))}
                </select>
                <button type="button" onClick={save} disabled={saving || unchanged} className="k-btn disabled:opacity-50">
                    {saving ? 'Saving...' : 'Change team leader'}
                </button>
            </div>
        </div>
    );
}
