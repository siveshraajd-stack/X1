'use client';

import { useCallback, useEffect, useState } from 'react';

/** Loads /api/team/overview and refreshes it when a request is decided or someone clocks in/out. */
export function useTeamOverview() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/team/overview', { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Failed to load dashboard');
            setData(body);
            setError('');
        } catch (e) {
            setError(e.message || 'Failed to load dashboard');
        }
    }, []);

    useEffect(() => {
        load();
        window.addEventListener('keystone:leave-updated', load);
        window.addEventListener('attendanceUpdated', load);
        return () => {
            window.removeEventListener('keystone:leave-updated', load);
            window.removeEventListener('attendanceUpdated', load);
        };
    }, [load]);

    return { data, error, reload: load };
}
