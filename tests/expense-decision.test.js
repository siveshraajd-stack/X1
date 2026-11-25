/** @jest-environment node */

const db = { claims: [], notifications: [], users: [] };

jest.mock('@/lib/db', () => ({
    prisma: {
        expenseClaim: {
            updateMany: async ({ where, data }) => {
                const c = db.claims.find((x) => x.id === where.id && x.status === where.status);
                if (!c) return { count: 0 };
                Object.assign(c, data);
                return { count: 1 };
            },
            findUnique: async ({ where }) => {
                const c = db.claims.find((x) => x.id === where.id);
                return c ? { ...c, user: db.users.find((u) => u.id === c.userId) } : null;
            },
        },
        user: {
            findUnique: async () => null, // OD attendance marking is covered in od-and-names.test.js
            findMany: async ({ where }) => db.users.filter((u) => u.role === where.role && u.companyId === where.companyId && u.id !== where.id.not),
        },
        notification: {
            create: async ({ data }) => db.notifications.push(data),
            createMany: async ({ data }) => db.notifications.push(...data),
        },
    },
}));
const mockSend = jest.fn(async () => ({ sent: true }));
jest.mock('@/lib/mailer', () => ({
    appBaseUrl: () => 'http://localhost',
    escapeHtml: (v) => String(v ?? ''),
    sendMail: (...args) => mockSend(...args),
}));
const mockWhatsApp = jest.fn(async () => ({ sent: true }));
jest.mock('@/lib/whatsapp', () => ({ sendWhatsApp: (...args) => mockWhatsApp(...args) }));

const { decideExpense } = require('@/lib/expense');

const mgr = { id: 'm1', name: 'Mgr', email: 'm@x.net', role: 'MANAGER' };
const hr = { id: 'h1', name: 'Hira', email: 'h@x.net', role: 'ADMIN' };

beforeEach(() => {
    db.users = [
        { id: 'e1', name: 'Emp', email: 'e@x.net', phone: '9876543210', companyId: 'c', role: 'EMPLOYEE' },
        { id: 'h1', name: 'Hira', email: 'h@x.net', phone: '9123456780', companyId: 'c', role: 'ADMIN' },
        { id: 'h2', name: 'Hari', email: 'h2@x.net', phone: null, companyId: 'c', role: 'ADMIN' },
    ];
    db.notifications = [];
    mockSend.mockClear();
    mockWhatsApp.mockClear();
    db.claims = [{ id: 'c1', userId: 'e1', managerId: 'm1', category: 'TRAVEL', travelMode: 'TRAIN', amount: 1200, projectName: 'Atlas', status: 'PENDING' }];
});

test('manager accepts: goes to HR (not the employee) by notification, WhatsApp and email', async () => {
    const out = await decideExpense({ claimId: 'c1', decision: 'APPROVED', comment: 'ok', decider: mgr });
    expect(out.final).toBe(false);
    expect(db.claims[0]).toMatchObject({ status: 'MANAGER_APPROVED', managerComment: 'ok' });
    expect(db.claims[0].decidedAt).toBeUndefined();
    expect(db.notifications.map((n) => n.userId).sort()).toEqual(['h1', 'h2']);
    expect(db.notifications[0].actionUrl).toBe('/admin/expenses');
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockWhatsApp).toHaveBeenCalledTimes(2);
    expect(mockWhatsApp.mock.calls.map(([a]) => a.to)).toContain('9123456780');
});

test('manager denies: goes straight back to the employee, HR is not involved', async () => {
    const out = await decideExpense({ claimId: 'c1', decision: 'REJECTED', comment: 'no bill', decider: mgr });
    expect(out.final).toBe(true);
    expect(db.claims[0]).toMatchObject({ status: 'REJECTED', managerComment: 'no bill', rejectedBy: 'MANAGER' });
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({ userId: 'e1', title: 'Expense claim rejected' });
    expect(mockWhatsApp).toHaveBeenCalledTimes(1);
    expect(mockWhatsApp.mock.calls[0][0].to).toBe('9876543210');
});

test('HR accepts after the manager: employee is told and the claim is approved', async () => {
    await decideExpense({ claimId: 'c1', decision: 'APPROVED', decider: mgr });
    db.notifications = [];
    const out = await decideExpense({ claimId: 'c1', decision: 'APPROVED', comment: 'paid', decider: hr });
    expect(out.final).toBe(true);
    expect(db.claims[0]).toMatchObject({ status: 'APPROVED', hrComment: 'paid' });
    expect(db.claims[0].decidedAt).toBeInstanceOf(Date);
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({ userId: 'e1', title: 'Expense claim approved' });
});

test('HR denies after the manager: employee is told', async () => {
    await decideExpense({ claimId: 'c1', decision: 'APPROVED', decider: mgr });
    await decideExpense({ claimId: 'c1', decision: 'REJECTED', comment: 'over limit', decider: hr });
    expect(db.claims[0]).toMatchObject({ status: 'REJECTED', hrComment: 'over limit', rejectedBy: 'HR' });
});

test('a manager cannot give the HR decision', async () => {
    await decideExpense({ claimId: 'c1', decision: 'APPROVED', decider: mgr });
    await expect(decideExpense({ claimId: 'c1', decision: 'APPROVED', decider: mgr })).rejects.toThrow('Only HR');
    expect(db.claims[0].status).toBe('MANAGER_APPROVED');
});

test('HR as the first approver has the last word', async () => {
    const out = await decideExpense({ claimId: 'c1', decision: 'APPROVED', decider: hr });
    expect(out.final).toBe(true);
    expect(db.claims[0].status).toBe('APPROVED');
});

test('a final claim cannot be decided again', async () => {
    await decideExpense({ claimId: 'c1', decision: 'REJECTED', decider: mgr });
    await expect(decideExpense({ claimId: 'c1', decision: 'APPROVED', decider: hr })).rejects.toThrow('already been decided');
    expect(db.claims[0].status).toBe('REJECTED');
});
