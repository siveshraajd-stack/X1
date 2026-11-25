/** @jest-environment node */
import { detailsSchema } from '@/lib/validations/employee-details';
import { addEmployeeSchema } from '@/lib/validations/auth';

jest.mock('@/lib/db', () => ({ prisma: {} }));

const { buildProfileData, mergeSensitive, readSensitive, sensitiveSummary, cleanRows } = require('@/lib/employee-details');

beforeAll(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-test-secret';
});

describe('employee details validation', () => {
    it('cleans PAN, Aadhaar, IFSC and phone numbers', () => {
        const out = detailsSchema.parse({
            alternateMobile: '98765 43210',
            sensitive: { panNo: 'abcde1234f', aadhaarNo: '1234 5678 9012', ifscCode: 'ciub0000123', salary: '45000.50' },
        });
        expect(out.alternateMobile).toBe('9876543210');
        expect(out.sensitive).toMatchObject({ panNo: 'ABCDE1234F', aadhaarNo: '123456789012', ifscCode: 'CIUB0000123' });
    });
    it('rejects bad PAN / Aadhaar / IFSC / dates', () => {
        expect(() => detailsSchema.parse({ sensitive: { panNo: '123' } })).toThrow();
        expect(() => detailsSchema.parse({ sensitive: { aadhaarNo: '123' } })).toThrow();
        expect(() => detailsSchema.parse({ sensitive: { ifscCode: 'XXXX123' } })).toThrow();
        expect(() => detailsSchema.parse({ dol: '12/05/2020' })).toThrow();
    });
    it('only accepts documents uploaded through our upload folder', () => {
        const doc = { documentType: 'PAN Document', fileName: 'pan.pdf' };
        expect(() => detailsSchema.parse({ documents: [{ ...doc, fileUrl: '/uploads/documents/abc-123.pdf' }] })).not.toThrow();
        expect(() => detailsSchema.parse({ documents: [{ ...doc, fileUrl: 'https://evil.example/x.pdf' }] })).toThrow();
        expect(() => detailsSchema.parse({ documents: [{ ...doc, fileUrl: '/uploads/documents/../../x.pdf' }] })).toThrow();
    });
    it('is optional on the create-employee schema', () => {
        const base = {
            firstName: 'Ravi', lastName: 'Kumar', email: 'r@c.com', password: 'Temp@1234', managerId: 'm1',
            managerEmail: 'b@c.com', jobPosition: 'Dev', department: 'Eng', dateOfJoining: '2026-01-01',
        };
        expect(addEmployeeSchema.parse(base).details).toBeUndefined();
        expect(addEmployeeSchema.parse({ ...base, details: { city: 'Chennai' } }).details.city).toBe('Chennai');
    });
});

describe('confidential details storage', () => {
    it('stores bank / PAN / Aadhaar encrypted and merges later edits', () => {
        const first = buildProfileData({ sensitive: { panNo: 'ABCDE1234F', salary: '50000' } }).sensitiveEnc;
        expect(first).not.toContain('ABCDE1234F');
        const second = mergeSensitive(first, { aadhaarNo: '123412341234', salary: '' });
        expect(readSensitive(second)).toEqual({ panNo: 'ABCDE1234F', aadhaarNo: '123412341234' });
    });
    it('leaves confidential values alone when they are not sent', () => {
        const enc = mergeSensitive(null, { panNo: 'ABCDE1234F' });
        expect(buildProfileData({ city: 'X' }, enc)).toEqual({ city: 'X' });
    });
    it('never reveals values in the summary, only which exist', () => {
        const enc = mergeSensitive(null, { panNo: 'ABCDE1234F' });
        const summary = sensitiveSummary(enc, true);
        expect(summary.present.panNo).toBe(true);
        expect(summary.present.salary).toBe(false);
        expect(JSON.stringify(summary)).not.toContain('ABCDE1234F');
    });
    it('drops empty list rows', () => {
        expect(cleanRows([{ name: ' A ', relationship: '' }, { name: '', relationship: '' }])).toEqual([{ name: 'A', relationship: '' }]);
    });
});
