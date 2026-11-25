/** @jest-environment node */
import { parseGraphDateTime, parseGraphEvents, getMeetingsForDay, teamsConfigured, resetTeamsCache } from '@/lib/teams-calendar';

const env = { MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's' };
const ev = (over = {}) => ({
    start: { dateTime: '2026-11-18T05:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-11-18T06:00:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    showAs: 'busy',
    responseStatus: { response: 'accepted' },
    ...over,
});

describe('Teams calendar', () => {
    beforeEach(() => resetTeamsCache());

    it('parses Graph times as UTC', () => {
        expect(parseGraphDateTime('2026-11-18T05:00:00.0000000')).toBe(Date.UTC(2026, 10, 18, 5, 0, 0));
        expect(parseGraphDateTime('2026-11-18T05:00:00')).toBe(Date.UTC(2026, 10, 18, 5, 0, 0));
        expect(Number.isNaN(parseGraphDateTime('2026-11-18T05:00:00.0000000', 'India Standard Time'))).toBe(true);
    });

    it('keeps real meetings and drops cancelled, all-day, free and declined events', () => {
        const list = parseGraphEvents([
            ev(),
            ev({ isCancelled: true }),
            ev({ isAllDay: true }),
            ev({ showAs: 'free' }),
            ev({ responseStatus: { response: 'declined' } }),
        ]);
        expect(list).toHaveLength(1);
        expect(list[0].end - list[0].start).toBe(3600000);
    });

    it('is off when not configured', async () => {
        expect(teamsConfigured({})).toBe(false);
        const r = await getMeetingsForDay('a@kaspl.net', '2026-11-18', { env: {}, fetchImpl: () => { throw new Error('no call'); } });
        expect(r).toEqual({ configured: false, ok: false, meetings: [] });
    });

    it('gets a token, follows paging and caches the day', async () => {
        const calls = [];
        const fetchImpl = async (url, opts) => {
            calls.push(url);
            if (url.includes('oauth2/v2.0/token')) return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
            if (url.includes('page2')) return { ok: true, json: async () => ({ value: [ev({ start: { dateTime: '2026-11-18T08:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-11-18T08:30:00.0000000', timeZone: 'UTC' } })] }) };
            expect(opts.headers.Authorization).toBe('Bearer tok');
            return { ok: true, json: async () => ({ value: [ev()], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/page2' }) };
        };
        const r = await getMeetingsForDay('A@kaspl.net', '2026-11-18', { env, fetchImpl, now: 1000 });
        expect(r.ok).toBe(true);
        expect(r.meetings).toHaveLength(2);
        const before = calls.length;
        await getMeetingsForDay('a@kaspl.net', '2026-11-18', { env, fetchImpl, now: 2000 });
        expect(calls.length).toBe(before); // served from the cache
    });

    it('returns no meetings (not a crash) when Microsoft fails', async () => {
        const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const r = await getMeetingsForDay('a@kaspl.net', '2026-11-18', { env, fetchImpl });
        spy.mockRestore();
        expect(r).toEqual({ configured: true, ok: false, meetings: [] });
    });
});
