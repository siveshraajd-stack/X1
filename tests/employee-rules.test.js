/** @jest-environment node */
import { addEmployeeSchema, changePasswordSchema, passwordRule } from '@/lib/validations/auth';

const valid = {
    firstName: 'Ravi', lastName: 'Kumar', email: 'RAVI@Company.com', password: 'Temp@1234',
    managerId: 'm1', managerEmail: 'Boss@Company.com', jobPosition: 'Dev', department: 'Eng', dateOfJoining: '2026-01-01',
};

describe('create employee validation', () => {
    it('accepts a complete payload and normalizes emails', () => {
        const out = addEmployeeSchema.parse(valid);
        expect(out.email).toBe('ravi@company.com');
        expect(out.managerEmail).toBe('boss@company.com');
        expect(out.role).toBe('EMPLOYEE');
    });
    it('rejects missing / invalid employee email', () => {
        expect(() => addEmployeeSchema.parse({ ...valid, email: '' })).toThrow();
        expect(() => addEmployeeSchema.parse({ ...valid, email: 'not-an-email' })).toThrow();
        const { email, ...rest } = valid;
        expect(() => addEmployeeSchema.parse(rest)).toThrow();
    });
    it('rejects missing / invalid manager and manager email', () => {
        const { managerEmail, ...noEmail } = valid;
        expect(() => addEmployeeSchema.parse(noEmail)).toThrow();
        expect(() => addEmployeeSchema.parse({ ...valid, managerEmail: 'x' })).toThrow();
        expect(() => addEmployeeSchema.parse({ ...valid, managerId: '' })).toThrow();
    });
    it('rejects weak temporary passwords and ADMIN role', () => {
        expect(() => addEmployeeSchema.parse({ ...valid, password: 'short1!' })).toThrow();
        expect(() => addEmployeeSchema.parse({ ...valid, role: 'ADMIN' })).toThrow();
    });
});

describe('password rules', () => {
    it.each([
        ['Abcdef1!', true],
        ['abcdef1!', false], // no uppercase
        ['Abcdefg!', false], // no number
        ['Abcdefg1', false], // no special character
        ['Ab1!', false], // too short
    ])('%s -> %s', (pw, ok) => {
        expect(passwordRule.safeParse(pw).success).toBe(ok);
    });

    it('change password: confirm must match and new must differ from old', () => {
        const good = { oldPassword: 'Old@1234', newPassword: 'New@12345', confirmPassword: 'New@12345' };
        expect(changePasswordSchema.safeParse(good).success).toBe(true);
        expect(changePasswordSchema.safeParse({ ...good, confirmPassword: 'Other@123' }).success).toBe(false);
        expect(changePasswordSchema.safeParse({ ...good, newPassword: 'Old@1234', confirmPassword: 'Old@1234' }).success).toBe(false);
        expect(changePasswordSchema.safeParse({ ...good, oldPassword: '' }).success).toBe(false);
    });
});
