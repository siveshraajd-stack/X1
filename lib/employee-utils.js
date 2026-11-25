import crypto from 'crypto';
import { prisma } from './db';

/**
 * Generate Employee ID in format: OIJODO20220001
 * OI = Company (Odoo India)
 * JODO = First 2 letters of first name + first 2 letters of last name
 * 2022 = Year of joining
 * 0001 = Serial number for that year
 *
 * The serial is incremented atomically so two admins creating employees at the
 * same time can never receive the same number.
 */
export async function generateEmployeeId(firstName, lastName, yearOfJoining, companyId, client = prisma) {
    const firstNamePart = firstName.substring(0, 2).toUpperCase();
    const lastNamePart = lastName.substring(0, 2).toUpperCase();

    const settings = await client.companySettings.upsert({
        where: { companyId_year: { companyId, year: yearOfJoining } },
        create: { companyId, year: yearOfJoining, lastSerialNumber: 1 },
        update: { lastSerialNumber: { increment: 1 } },
    });

    const serialNumberFormatted = String(settings.lastSerialNumber).padStart(4, '0');
    return `OI${firstNamePart}${lastNamePart}${yearOfJoining}${serialNumberFormatted}`;
}

/**
 * Generate a random secure password (crypto based).
 * Always contains an uppercase letter, lowercase letter, number and special character.
 */
export function generateRandomPassword(length = 12) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';
    const allChars = uppercase + lowercase + numbers + special;
    const pick = (set) => set[crypto.randomInt(set.length)];

    const chars = [pick(uppercase), pick(lowercase), pick(numbers), pick(special)];
    while (chars.length < length) chars.push(pick(allChars));

    // Fisher-Yates shuffle with a secure random source
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

/**
 * Format employee name from first and last name
 */
export function formatEmployeeName(firstName, lastName) {
    return `${firstName} ${lastName}`.trim();
}
