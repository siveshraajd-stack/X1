/** @jest-environment node */

// In-memory stand-in for Prisma (users only)
const db = { users: [] };
jest.mock('@/lib/db', () => ({
    prisma: {
        user: {
            findFirst: async ({ where }) => {
                const ors = where.OR;
                const u = db.users.find((x) => ors.some((o) => (o.email && x.email === o.email) || (o.employeeId && x.employeeId === o.employeeId)));
                return u ? { ...u, profile: u.profile } : null;
            },
            update: async ({ where, data }) => Object.assign(db.users.find((x) => x.id === where.id), data),
        },
    },
}));
let configured = true;
const mockSend = jest.fn(async () => ({ sent: true }));
jest.mock('@/lib/mailer', () => ({
    appBaseUrl: () => 'http://localhost:3000',
    escapeHtml: (v) => String(v ?? ''),
    isMailConfigured: () => configured,
    sendMail: (...a) => mockSend(...a),
}));

const { hashPassword, verifyPassword } = require('@/lib/auth-utils');
const { passwordRule } = require('@/lib/validations/auth');
const { generateTempPassword, requestPasswordReset, checkPasswordWithReset, RESET_PASSWORD_TTL_MS } = require('@/lib/password-reset');

let oldHash;
beforeAll(async () => {
    oldHash = await hashPassword('Old123@');
});
beforeEach(() => {
    configured = true;
    mockSend.mockClear();
    mockSend.mockImplementation(async () => ({ sent: true }));
    db.users = [
        { id: 'u1', name: 'Sam Carter', email: 'sam@kaspl.net', employeeId: 'SAM1', password: oldHash, mustChangePassword: false, resetPasswordHash: null, resetPasswordExpiry: null, profile: { personalEmail: 'sam.personal@gmail.com' } },
        { id: 'u2', name: 'No Mail', email: 'nomail@kaspl.net', employeeId: 'NOM1', password: oldHash, mustChangePassword: false, resetPasswordHash: null, resetPasswordExpiry: null, profile: { personalEmail: null } },
    ];
});

const sentPassword = () => /temporary password: (\S+)/i.exec(mockSend.mock.calls[0][0].text)[1];

test('temporary passwords always satisfy the password rule', () => {
    for (let i = 0; i < 200; i++) expect(() => passwordRule.parse(generateTempPassword())).not.toThrow();
});

describe('forgot password goes to the personal email in the profile', () => {
    test('mail goes only to the personal email, by work email or by employee id', async () => {
        expect(await requestPasswordReset('SAM@kaspl.net')).toEqual({ sent: true });
        expect(mockSend.mock.calls[0][0].to).toBe('sam.personal@gmail.com');
        expect(await verifyPassword(sentPassword(), db.users[0].resetPasswordHash)).toBe(true);
        expect(db.users[0].resetPasswordExpiry.getTime()).toBeGreaterThan(Date.now() + RESET_PASSWORD_TTL_MS - 5000);
        mockSend.mockClear();
        db.users[0].resetPasswordExpiry = null;
        expect(await requestPasswordReset('sam1')).toEqual({ sent: true });
    });

    test('unknown account or no personal email: nothing is sent, nothing changes', async () => {
        expect(await requestPasswordReset('ghost@kaspl.net')).toEqual({ sent: false });
        expect(await requestPasswordReset('nomail@kaspl.net')).toEqual({ sent: false });
        expect(mockSend).not.toHaveBeenCalled();
        expect(db.users[1].resetPasswordHash).toBeNull();
    });

    test('one mail per minute; a failed send leaves no usable temporary password', async () => {
        await requestPasswordReset('sam@kaspl.net');
        expect(await requestPasswordReset('sam@kaspl.net')).toEqual({ sent: false });
        expect(mockSend).toHaveBeenCalledTimes(1);

        db.users[0].resetPasswordHash = null;
        db.users[0].resetPasswordExpiry = null;
        mockSend.mockImplementation(async () => ({ sent: false }));
        expect(await requestPasswordReset('sam@kaspl.net')).toEqual({ sent: false });
        expect(db.users[0].resetPasswordHash).toBeNull();
    });

    test('empty input and unconfigured mail are errors', async () => {
        await expect(requestPasswordReset('  ')).rejects.toThrow('Enter your email');
        configured = false;
        await expect(requestPasswordReset('sam@kaspl.net')).rejects.toMatchObject({ status: 503 });
    });
});

describe('signing in with the temporary password', () => {
    test('old password keeps working while a reset is pending (no lock-out) and then cancels it', async () => {
        await requestPasswordReset('sam@kaspl.net');
        const out = await checkPasswordWithReset(db.users[0], 'Old123@');
        expect(out).toEqual({ ok: true, mustChangePassword: false });
        expect(db.users[0].resetPasswordHash).toBeNull();
    });

    test('temporary password signs in once, becomes the password and forces a change', async () => {
        await requestPasswordReset('sam@kaspl.net');
        const temp = sentPassword();
        const out = await checkPasswordWithReset(db.users[0], temp);
        expect(out).toEqual({ ok: true, mustChangePassword: true });
        expect(db.users[0].mustChangePassword).toBe(true);
        expect(await verifyPassword(temp, db.users[0].password)).toBe(true);
        expect(db.users[0].resetPasswordHash).toBeNull();
        expect(await verifyPassword('Old123@', db.users[0].password)).toBe(false);
    });

    test('expired or wrong temporary passwords fail', async () => {
        await requestPasswordReset('sam@kaspl.net');
        const temp = sentPassword();
        expect((await checkPasswordWithReset(db.users[0], 'Wrong123@')).ok).toBe(false);
        db.users[0].resetPasswordExpiry = new Date(Date.now() - 1000);
        expect((await checkPasswordWithReset(db.users[0], temp)).ok).toBe(false);
    });
});
