/** @jest-environment node */

// users: HR -> Manager -> Team Lead -> two employees; a second team lead under the manager; an outsider
const users = [
    { id: 'hr', role: 'ADMIN', companyId: 'c1', managerId: null },
    { id: 'mgr', role: 'MANAGER', companyId: 'c1', managerId: 'hr' },
    { id: 'tl1', role: 'TEAM_LEAD', companyId: 'c1', managerId: 'mgr' },
    { id: 'tl2', role: 'TEAM_LEAD', companyId: 'c1', managerId: 'mgr' },
    { id: 'e1', role: 'EMPLOYEE', companyId: 'c1', managerId: 'tl1' },
    { id: 'e2', role: 'EMPLOYEE', companyId: 'c1', managerId: 'tl1' },
    { id: 'e3', role: 'EMPLOYEE', companyId: 'c1', managerId: 'tl2' },
    { id: 'x1', role: 'EMPLOYEE', companyId: 'c2', managerId: null },
];

jest.mock('@/lib/db', () => ({
    prisma: {
        user: {
            findMany: async ({ where }) =>
                users
                    .filter((u) => u.companyId === where.companyId)
                    .filter((u) => (typeof where.managerId === 'string' ? u.managerId === where.managerId : where.managerId.in.includes(u.managerId)))
                    .filter((u) => !where.role || where.role.in.includes(u.role))
                    .map((u) => ({ id: u.id })),
        },
    },
}));

const { getTeamIds, isInTeam } = require('@/lib/team');
const byId = (id) => users.find((u) => u.id === id);

describe('team scope', () => {
    test('a team lead sees only their direct reports', async () => {
        expect((await getTeamIds(byId('tl1'))).sort()).toEqual(['e1', 'e2']);
    });

    test('a manager sees team leads and everybody below them', async () => {
        expect((await getTeamIds(byId('mgr'))).sort()).toEqual(['e1', 'e2', 'e3', 'tl1', 'tl2']);
    });

    test('nobody sees themselves, other companies, or people above them', async () => {
        const ids = await getTeamIds(byId('mgr'));
        expect(ids).not.toContain('mgr');
        expect(ids).not.toContain('hr');
        expect(ids).not.toContain('x1');
    });

    test('employees and HR have no team here', async () => {
        expect(await getTeamIds(byId('e1'))).toEqual([]);
        expect(await getTeamIds(byId('hr'))).toEqual([]);
    });

    test('isInTeam: team lead is limited to own reports, manager reaches the whole tree, HR everywhere', async () => {
        expect(await isInTeam(byId('tl1'), 'e1')).toBe(true);
        expect(await isInTeam(byId('tl1'), 'e3')).toBe(false);
        expect(await isInTeam(byId('mgr'), 'e3')).toBe(true);
        expect(await isInTeam(byId('mgr'), 'x1')).toBe(false);
        expect(await isInTeam(byId('hr'), 'e3')).toBe(true);
    });

    test('a reporting loop cannot hang the manager lookup', async () => {
        users.push({ id: 'loopA', role: 'MANAGER', companyId: 'c1', managerId: 'loopB' }, { id: 'loopB', role: 'TEAM_LEAD', companyId: 'c1', managerId: 'loopA' });
        const ids = await getTeamIds(byId('loopA'));
        expect(ids).toEqual(['loopB']);
        users.splice(-2, 2);
    });
});
