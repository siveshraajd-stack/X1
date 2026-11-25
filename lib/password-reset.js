import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth-utils';
import { AppError } from '@/lib/errors';
import { escapeHtml, isMailConfigured, appBaseUrl, sendMail } from '@/lib/mailer';

// "Forgot password": a temporary password is e-mailed to the PERSONAL e-mail saved in the
// employee's profile. It is a one-time-style password:
//   - only its bcrypt hash is stored (User.resetPasswordHash) and it expires after one hour
//   - the old password keeps working until the temporary one is used to sign in, so nobody can
//     lock somebody else out by typing their e-mail on the forgot-password page
//   - after signing in with it the person must choose a new password (mustChangePassword = true)
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
export const RESET_REQUEST_GAP_MS = 60 * 1000; // at most one mail per minute per account

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '@#$%&*!?';
const pick = (set) => set[crypto.randomInt(set.length)];

/** 10 characters, always with an uppercase letter, a lowercase letter, a number and a special character. */
export function generateTempPassword() {
    const all = UPPER + LOWER + DIGITS + SPECIAL;
    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
    while (chars.length < 10) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

function resetEmail({ name, loginEmail, tempPassword }) {
    const minutes = RESET_PASSWORD_TTL_MS / 60000;
    const signIn = `${appBaseUrl()}/auth/login`;
    const text = [
        `Hello ${name},`,
        '',
        'You asked to reset your Keystone password.',
        `Your temporary password: ${tempPassword}`,
        '',
        `Sign in at ${signIn} with your login (${loginEmail}) and this temporary password.`,
        `It is valid for ${minutes} minutes. After signing in you will be asked to choose a new password.`,
        '',
        'If you did not ask for this, ignore this email: your current password still works.',
    ].join('\n');
    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">Your temporary password</h2>
  <p style="font-size:14px">Hello ${escapeHtml(name)}, you asked to reset your Keystone password.</p>
  <p style="font-size:22px;font-weight:bold;letter-spacing:2px;background:#f3f4f6;padding:14px 18px;display:inline-block;font-family:monospace">${escapeHtml(tempPassword)}</p>
  <p style="font-size:14px">Sign in at <a href="${escapeHtml(signIn)}">${escapeHtml(signIn)}</a> with your login (<b>${escapeHtml(loginEmail)}</b>) and this temporary password. It is valid for ${minutes} minutes, and you will be asked to choose a new password right after.</p>
  <p style="font-size:12px;color:#666">If you did not ask for this, ignore this email: your current password still works.</p>
</div>`;
    return { text, html };
}

/**
 * Send a temporary password to the personal e-mail in the profile of the account that has this
 * login id (work e-mail or employee id). Returns { sent }. It never says whether an account exists:
 * `sent: false` covers "no such account", "no personal e-mail in the profile", "asked a moment ago"
 * and "the e-mail could not be sent".
 */
export async function requestPasswordReset(loginId, now = new Date()) {
    const id = String(loginId || '').trim();
    if (!id) throw new AppError('Enter your email or employee ID', 400);
    if (!isMailConfigured()) {
        throw new AppError('Email service is not configured, so a password cannot be sent. Please contact HR.', 503);
    }

    const user = await prisma.user.findFirst({
        where: { OR: [{ email: id.toLowerCase() }, { employeeId: id.toUpperCase() }] },
        select: {
            id: true,
            name: true,
            email: true,
            resetPasswordExpiry: true,
            profile: { select: { personalEmail: true } },
        },
    });
    const personalEmail = String(user?.profile?.personalEmail || '').trim();
    if (!user || !personalEmail) return { sent: false };

    // One mail per minute per account (the request time is expiry - TTL)
    if (user.resetPasswordExpiry && user.resetPasswordExpiry.getTime() - RESET_PASSWORD_TTL_MS > now.getTime() - RESET_REQUEST_GAP_MS) {
        return { sent: false };
    }

    const tempPassword = generateTempPassword();
    await prisma.user.update({
        where: { id: user.id },
        data: {
            resetPasswordHash: await hashPassword(tempPassword),
            resetPasswordExpiry: new Date(now.getTime() + RESET_PASSWORD_TTL_MS),
        },
    });

    const { text, html } = resetEmail({ name: user.name, loginEmail: user.email, tempPassword });
    const result = await sendMail({
        to: personalEmail,
        subject: 'Your Keystone temporary password',
        text,
        html,
        fromName: 'Keystone',
    });
    if (!result.sent) {
        // Nothing was delivered, so the temporary password must not stay valid
        await prisma.user.update({ where: { id: user.id }, data: { resetPasswordHash: null, resetPasswordExpiry: null } });
        return { sent: false };
    }
    return { sent: true };
}

/**
 * Sign-in check used by the login. The normal password always works. A not-yet-expired temporary
 * password works too; using it makes it the account password and forces a password change.
 * Returns { ok, mustChangePassword }.
 */
export async function checkPasswordWithReset(user, plain, now = new Date()) {
    if (await verifyPassword(plain, user.password)) {
        // Signed in normally: any temporary password that was e-mailed is no longer needed
        if (user.resetPasswordHash) {
            await prisma.user.update({ where: { id: user.id }, data: { resetPasswordHash: null, resetPasswordExpiry: null } });
        }
        return { ok: true, mustChangePassword: user.mustChangePassword };
    }

    const valid = user.resetPasswordHash && user.resetPasswordExpiry && user.resetPasswordExpiry > now;
    if (valid && (await verifyPassword(plain, user.resetPasswordHash))) {
        await prisma.user.update({
            where: { id: user.id },
            data: { password: user.resetPasswordHash, resetPasswordHash: null, resetPasswordExpiry: null, mustChangePassword: true },
        });
        return { ok: true, mustChangePassword: true };
    }
    return { ok: false, mustChangePassword: user.mustChangePassword };
}
