import crypto from 'crypto';
import { prisma } from '@/lib/db';

// AES-256-GCM. The key is derived from PASSWORD_VAULT_KEY (preferred) or NEXTAUTH_SECRET.
function getKey() {
    const secret = process.env.PASSWORD_VAULT_KEY || process.env.NEXTAUTH_SECRET;
    if (!secret) return null;
    return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain, key = getKey()) {
    if (!key) throw new Error('PASSWORD_VAULT_KEY or NEXTAUTH_SECRET must be set');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptSecret(payload, key = getKey()) {
    if (!key || !payload) return null;
    try {
        const [iv, tag, data] = String(payload).split('.');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    } catch {
        return null; // wrong key or corrupted value
    }
}

/** Save the current password of a user for HR lookup. Never throws (login must not break). */
export async function storePassword(userId, plain, db = prisma) {
    try {
        const encrypted = encryptSecret(plain);
        await db.passwordVault.upsert({
            where: { userId },
            update: { encrypted },
            create: { userId, encrypted },
        });
    } catch (error) {
        console.error('Could not store password copy', error);
    }
}

/** Decrypted password of a user, or null when none is stored. */
export async function readPassword(userId) {
    const row = await prisma.passwordVault.findUnique({ where: { userId } });
    return row ? decryptSecret(row.encrypted) : null;
}
