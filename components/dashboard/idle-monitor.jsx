'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { IDLE_HEARTBEAT_MS, IDLE_STATE_REFRESH_MS } from '@/lib/constants';
import { IDLE_THRESHOLD_MS, activeMs, exclusionAt } from '@/lib/idle';

const TICK_MS = 5000;
const ENDPOINT = '/api/attendance/idle';

const toMs = (list) => (list || []).map((i) => ({ label: i.label, start: new Date(i.start).getTime(), end: new Date(i.end).getTime() }));

/**
 * Employee only. Shows nothing on screen: it quietly watches the cursor while the employee is clocked in
 * and sends the result to the server, which keeps it for the "My Logs" page.
 *  - break / lunch / Teams meeting time is never counted (the server sends those windows)
 *  - after 5 minutes without cursor movement a notification is created (once per idle stretch)
 *  - every further minute without movement is counted as idle time
 * The browser can only see the cursor while it is over a page of this portal, and only while this tab is in front.
 */
export function IdleMonitor() {
    const { data: session } = useSession();
    const userId = session?.user?.id;

    const [state, setState] = useState(null); // server state (null while loading)

    const stateRef = useRef(null);
    const exclusionsRef = useRef([]);
    const lastMoveRef = useRef(Date.now());
    const episodeRef = useRef(null); // { startedAt } while an idle stretch is being reported
    const lastBeatRef = useRef(0);

    const loadState = useCallback(async () => {
        try {
            const res = await fetch(ENDPOINT, { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            stateRef.current = data;
            exclusionsRef.current = toMs(data.exclusions);
            setState(data);
        } catch {
            /* offline: keep the last known state */
        }
    }, []);

    const report = useCallback(async (startedAt, endedAt) => {
        try {
            await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString() }),
            });
        } catch {
            /* the next report covers the same stretch */
        }
    }, []);

    // Load the state, refresh it regularly, and reload it when the employee clocks in / out
    useEffect(() => {
        if (!userId) return undefined;
        loadState();
        const timer = setInterval(loadState, IDLE_STATE_REFRESH_MS);
        const onAttendance = () => {
            lastMoveRef.current = Date.now();
            loadState();
        };
        window.addEventListener('attendanceUpdated', onAttendance);
        return () => {
            clearInterval(timer);
            window.removeEventListener('attendanceUpdated', onAttendance);
        };
    }, [userId, loadState]);

    // Cursor + tab watching
    useEffect(() => {
        if (!state?.enabled) return undefined;

        const finish = (endMs) => {
            const episode = episodeRef.current;
            episodeRef.current = null;
            lastBeatRef.current = 0;
            if (episode) report(episode.startedAt, endMs);
        };

        const onMove = () => {
            const now = Date.now();
            if (episodeRef.current) finish(now); // the cursor moved: the idle stretch is over
            lastMoveRef.current = now;
        };

        // A tab in the background tells us nothing about the cursor: close the stretch and start fresh when back
        const onVisibility = () => {
            const now = Date.now();
            if (document.hidden) finish(now);
            else {
                lastMoveRef.current = now;
                loadState();
            }
        };

        const onPageHide = () => {
            const episode = episodeRef.current;
            if (!episode || typeof navigator.sendBeacon !== 'function') return;
            const body = new Blob([JSON.stringify({ startedAt: new Date(episode.startedAt).toISOString(), endedAt: new Date().toISOString() })], {
                type: 'application/json',
            });
            navigator.sendBeacon(ENDPOINT, body);
            episodeRef.current = null;
        };

        const tick = () => {
            const current = stateRef.current;
            if (!current?.working) {
                episodeRef.current = null;
                return;
            }
            if (document.hidden) return;
            const now = Date.now();
            const exclusions = exclusionsRef.current;
            const quiet = activeMs(lastMoveRef.current, now, exclusions);
            const inside = exclusionAt(now, exclusions);

            if (quiet >= IDLE_THRESHOLD_MS && !inside) {
                if (!episodeRef.current) episodeRef.current = { startedAt: lastMoveRef.current };
                if (now - lastBeatRef.current >= IDLE_HEARTBEAT_MS) {
                    lastBeatRef.current = now;
                    report(episodeRef.current.startedAt, now);
                }
            }
        };

        window.addEventListener('mousemove', onMove, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onPageHide);
        const timer = setInterval(tick, TICK_MS);
        tick();
        return () => {
            window.removeEventListener('mousemove', onMove);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onPageHide);
            clearInterval(timer);
            // Moving to another page of the portal: close the open stretch so it is saved
            if (episodeRef.current) finish(Date.now());
        };
    }, [state?.enabled, report, loadState]);

    return null;
}
