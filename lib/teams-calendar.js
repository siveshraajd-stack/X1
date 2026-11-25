// Meeting times from the employee's Microsoft Teams / Outlook calendar (Microsoft Graph).
//
// Uses an Azure AD app registration with the APPLICATION permission "Calendars.Read" (admin consent
// granted). Set MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET (see .env.example). The employee is
// looked up by the e-mail they log in with, which must be their Microsoft 365 address.
// If it is not configured, or Microsoft cannot be reached, no meetings are returned and the dashboard
// says so; nothing else breaks.

import { dayStart } from '@/lib/dates';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const CACHE_MS = 5 * 60 * 1000;
const ERROR_CACHE_MS = 60 * 1000;
const MAX_PAGES = 5;

let tokenCache = null; // { token, expiresAt }
const dayCache = new Map(); // `${email}|${key}` -> { at, ttl, value }

export function teamsConfigured(env = process.env) {
    return Boolean(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET);
}

/** Graph sends "2026-11-24T05:00:00.0000000" (7 decimals, no zone) in the zone we asked for (UTC). */
export function parseGraphDateTime(value, timeZone = 'UTC') {
    if (!value || String(timeZone || 'UTC').toUpperCase() !== 'UTC') return NaN;
    let text = String(value).replace(/(\.\d{3})\d+/, '$1');
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(text)) text += 'Z';
    return new Date(text).getTime();
}

/** Graph events -> [{ start, end, label }] in ms. Skips cancelled, all-day, "free" and declined events. */
export function parseGraphEvents(events) {
    const out = [];
    for (const ev of events || []) {
        if (!ev || ev.isCancelled || ev.isAllDay) continue;
        if (String(ev.showAs || '').toLowerCase() === 'free') continue;
        if (String(ev.responseStatus?.response || '').toLowerCase() === 'declined') continue;
        const start = parseGraphDateTime(ev.start?.dateTime, ev.start?.timeZone);
        const end = parseGraphDateTime(ev.end?.dateTime, ev.end?.timeZone);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        out.push({ start, end, label: 'Teams meeting' });
    }
    return out;
}

async function getToken(fetchImpl, env, now) {
    if (tokenCache && tokenCache.expiresAt > now + 60 * 1000) return tokenCache.token;
    const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.MS_CLIENT_ID,
            client_secret: env.MS_CLIENT_SECRET,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials',
        }).toString(),
    });
    if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status})`);
    const data = await res.json();
    if (!data.access_token) throw new Error('Microsoft sign-in returned no token');
    tokenCache = { token: data.access_token, expiresAt: now + Number(data.expires_in || 3600) * 1000 };
    return tokenCache.token;
}

/**
 * Meetings of one IST day for one employee.
 * @returns {{ configured: boolean, ok: boolean, meetings: Array<{start:number,end:number,label:string}> }}
 */
export async function getMeetingsForDay(email, key, { fetchImpl = fetch, env = process.env, now = Date.now() } = {}) {
    if (!teamsConfigured(env)) return { configured: false, ok: false, meetings: [] };
    const address = String(email || '').trim().toLowerCase();
    if (!address) return { configured: true, ok: false, meetings: [] };

    const cacheKey = `${address}|${key}`;
    const cached = dayCache.get(cacheKey);
    if (cached && now - cached.at < cached.ttl) return cached.value;

    let value;
    try {
        const token = await getToken(fetchImpl, env, now);
        const from = dayStart(key);
        const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
        let url =
            `${GRAPH}/users/${encodeURIComponent(address)}/calendarView` +
            `?startDateTime=${encodeURIComponent(from.toISOString())}&endDateTime=${encodeURIComponent(to.toISOString())}` +
            `&$select=subject,start,end,isAllDay,isCancelled,showAs,responseStatus&$top=100`;
        const events = [];
        for (let page = 0; url && page < MAX_PAGES; page++) {
            const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
            if (res.status === 401) tokenCache = null;
            if (!res.ok) throw new Error(`Microsoft calendar request failed (${res.status})`);
            const data = await res.json();
            events.push(...(data.value || []));
            url = data['@odata.nextLink'] || null;
        }
        value = { configured: true, ok: true, meetings: parseGraphEvents(events) };
        dayCache.set(cacheKey, { at: now, ttl: CACHE_MS, value });
    } catch (error) {
        console.error('Teams calendar lookup failed', error.message);
        value = { configured: true, ok: false, meetings: [] };
        dayCache.set(cacheKey, { at: now, ttl: ERROR_CACHE_MS, value });
    }
    return value;
}

/** Test helper: forget cached tokens and meetings. */
export function resetTeamsCache() {
    tokenCache = null;
    dayCache.clear();
}
