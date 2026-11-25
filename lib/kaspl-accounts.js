import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth-utils';
import { storePassword } from '@/lib/password-vault';
import { generateEmployeeId } from '@/lib/employee-utils';

// ---- Default company logins -------------------------------------------------
// HR       : hr@kaspl.net       / Hr123@
// Manager  : manager@kaspl.net  / Manager123@
// Employee : <any name>@kaspl.net / Emp123@
// These accounts are created automatically the first time somebody logs in with
// the correct default password. After that the password lives in the database
// (hashed) and can be changed / reset like any other.
export const KASPL_DOMAIN = '@kaspl.net';
export const HR_EMAIL = 'hr@kaspl.net';
export const HR_PASSWORD = 'Hr123@';
export const MANAGER_EMAIL = 'manager@kaspl.net';
export const MANAGER_PASSWORD = 'Manager123@';
export const TEAM_LEAD_EMAIL = 'teamlead@kaspl.net';
export const TEAM_LEAD_PASSWORD = 'Manager123@';
export const EMPLOYEE_PASSWORD = 'Emp123@';
export const DEFAULT_COMPANY_NAME = 'Keystone Technologies';

export function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

/** "john.doe@kaspl.net" -> "John Doe" */
export function nameFromEmail(email) {
    const local = normalizeEmail(email).split('@')[0] || '';
    const words = local.split(/[._\-+]+/).filter(Boolean);
    if (!words.length) return 'Employee';
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Role + default password a kaspl.net address is entitled to, or null if not a kaspl.net address. */
export function defaultAccountFor(email) {
    const e = normalizeEmail(email);
    if (!e.endsWith(KASPL_DOMAIN)) return null;
    const local = e.slice(0, -KASPL_DOMAIN.length);
    if (!/^[a-z0-9][a-z0-9._\-+]*$/.test(local)) return null;
    if (e === HR_EMAIL) return { role: 'ADMIN', password: HR_PASSWORD };
    if (e === MANAGER_EMAIL) return { role: 'MANAGER', password: MANAGER_PASSWORD };
    if (e === TEAM_LEAD_EMAIL) return { role: 'TEAM_LEAD', password: TEAM_LEAD_PASSWORD };
    return { role: 'EMPLOYEE', password: EMPLOYEE_PASSWORD };
}

async function ensureCompany() {
    const hr = await prisma.user.findUnique({ where: { email: HR_EMAIL }, select: { companyId: true } });
    if (hr?.companyId) return hr.companyId;
    const existing = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing.id;
    const created = await prisma.company.create({ data: { name: DEFAULT_COMPANY_NAME, logo: '/logo.png' } });
    return created.id;
}

async function createAccount({ email, role, password, companyId, manager }) {
    const name = role === 'ADMIN' ? 'HR' : role === 'MANAGER' && email === MANAGER_EMAIL ? 'Manager' : role === 'TEAM_LEAD' && email === TEAM_LEAD_EMAIL ? 'Team Lead' : nameFromEmail(email);
    const parts = name.split(' ');
    const hashed = await hashPassword(password);
    const now = new Date();

    const user = await prisma.$transaction(async (tx) => {
        const employeeId =
            role === 'ADMIN'
                ? null
                : await generateEmployeeId(parts[0], parts.slice(1).join(' '), now.getFullYear(), companyId, tx);
        const created = await tx.user.create({
            data: {
                employeeId,
                email,
                password: hashed,
                name,
                role,
                companyId,
                managerId: manager?.id || null,
                managerEmail: manager?.email || null,
                emailVerified: true,
                // Every new employee / manager must replace the default password at first login
                mustChangePassword: role !== 'ADMIN',
            },
        });
        if (role !== 'ADMIN') {
            await tx.employeeProfile.create({ data: { userId: created.id } });
            await tx.jobDetails.create({
                data: {
                    userId: created.id,
                    jobPosition: role === 'MANAGER' ? 'Manager' : role === 'TEAM_LEAD' ? 'Team Lead' : 'Employee',
                    manager: manager?.name || null,
                    dateOfJoining: now,
                },
            });
        }
        return created;
    });

    await storePassword(user.id, password);
    return user;
}

async function getOrCreate(email, role, password, companyId, manager) {
    const found = await prisma.user.findUnique({ where: { email } });
    if (found) return found;
    try {
        return await createAccount({ email, role, password, companyId, manager });
    } catch (error) {
        // Two simultaneous first logins: the other request created it, use that one.
        const again = await prisma.user.findUnique({ where: { email } });
        if (again) return again;
        throw error;
    }
}

/**
 * Called when no account exists for `email`. Creates it only when the password is the
 * correct default for that address. Returns the user, or null.
 */
export async function provisionDefaultAccount(email, password) {
    const e = normalizeEmail(email);
    const spec = defaultAccountFor(e);
    if (!spec || password !== spec.password) return null;

    const companyId = await ensureCompany();
    const hr = await getOrCreate(HR_EMAIL, 'ADMIN', HR_PASSWORD, companyId, null);
    if (e === HR_EMAIL) return hr;

    const hrRef = { id: hr.id, email: hr.email, name: hr.name };
    const manager = await getOrCreate(MANAGER_EMAIL, 'MANAGER', MANAGER_PASSWORD, hr.companyId || companyId, hrRef);
    if (e === MANAGER_EMAIL) return manager;

    const managerRef = { id: manager.id, email: manager.email, name: manager.name };
    if (e === TEAM_LEAD_EMAIL) return getOrCreate(e, 'TEAM_LEAD', TEAM_LEAD_PASSWORD, hr.companyId || companyId, managerRef);

    return getOrCreate(e, 'EMPLOYEE', EMPLOYEE_PASSWORD, hr.companyId || companyId, {
        id: manager.id,
        email: manager.email,
        name: manager.name,
    });
}
