import { encryptSecret, decryptSecret } from '@/lib/password-vault';
import { AppError } from '@/lib/errors';

// Plain text columns of EmployeeProfile that the new sections write to
export const SCALAR_KEYS = [
    'divisionSection', 'employmentStatus', 'city', 'permanentAddress', 'alternateMobile', 'bloodGroup',
    'emergencyContactName', 'emergencyContactNumber', 'emergencyContactRelation',
    'uanNumber', 'pfNumber', 'dojInPf', 'dol', 'rol', 'probationStatus', 'dateOfConfirmation', 'esicNumber',
];
export const LIST_KEYS = ['familyMembers', 'education', 'experience'];
// Confidential values: CUB / personal bank account, IFSC, bank name, salary, PAN, Aadhaar
export const SENSITIVE_KEYS = ['cubAccountNumber', 'personalBankAccount', 'ifscCode', 'bankName', 'salary', 'panNo', 'aadhaarNo'];
export const MASK = 'XXXX XXXX';

/** Rows where every cell is empty are dropped; all values are trimmed. */
export function cleanRows(rows) {
    return (rows || [])
        .map((row) => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])))
        .filter((row) => Object.values(row).some((v) => v !== '' && v !== undefined && v !== null));
}

/** Decrypted confidential values of a profile ({} when none). Throws if the stored blob cannot be read. */
export function readSensitive(enc) {
    if (!enc) return {};
    const plain = decryptSecret(enc);
    if (plain === null) throw new AppError('Stored confidential details could not be decrypted. Check PASSWORD_VAULT_KEY / NEXTAUTH_SECRET.', 500);
    try {
        const parsed = JSON.parse(plain);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        throw new AppError('Stored confidential details are corrupted.', 500);
    }
}

/** Which confidential values exist (true / false only, never the values). */
export function sensitivePresence(enc) {
    let values = {};
    try {
        values = readSensitive(enc);
    } catch {
        return Object.fromEntries(SENSITIVE_KEYS.map((k) => [k, false]));
    }
    return Object.fromEntries(SENSITIVE_KEYS.map((k) => [k, Boolean(values[k])]));
}

/** Send this to the browser instead of the confidential values. */
export function sensitiveSummary(enc, canReveal) {
    return { present: sensitivePresence(enc), canReveal: Boolean(canReveal) };
}

/**
 * Merge the confidential values that were sent into what is stored.
 * A key that is not sent stays as it is; an empty string clears it.
 * Returns the new encrypted blob (or null when nothing is left).
 */
export function mergeSensitive(existingEnc, input) {
    const current = readSensitive(existingEnc);
    for (const key of SENSITIVE_KEYS) {
        if (input[key] === undefined) continue;
        const value = String(input[key]).trim();
        if (value) current[key] = value;
        else delete current[key];
    }
    return Object.keys(current).length ? encryptSecret(JSON.stringify(current)) : null;
}

/**
 * Turns the validated `details` object into the data for EmployeeProfile.
 * Only keys that were sent are included, so nothing else is cleared by accident.
 */
export function buildProfileData(details, existingEnc = null) {
    const data = {};
    for (const key of SCALAR_KEYS) {
        if (details[key] !== undefined) data[key] = details[key] ? details[key] : null;
    }
    for (const key of LIST_KEYS) {
        if (details[key] !== undefined) data[key] = cleanRows(details[key]);
    }
    if (details.sensitive !== undefined) data.sensitiveEnc = mergeSensitive(existingEnc, details.sensitive);
    return data;
}

/** Add the newly uploaded documents and remove the ones HR deleted. `db` is prisma or a transaction client. */
export async function saveDocuments(db, userId, details) {
    if (details.removeDocumentIds?.length) {
        await db.document.deleteMany({ where: { userId, id: { in: details.removeDocumentIds } } });
    }
    if (details.documents?.length) {
        await db.document.createMany({
            data: details.documents.map((d) => ({
                userId,
                fileName: d.fileName,
                fileType: d.fileUrl.split('.').pop(),
                fileUrl: d.fileUrl,
                documentType: d.documentType,
            })),
        });
    }
}
