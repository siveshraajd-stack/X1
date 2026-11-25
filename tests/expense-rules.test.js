/** @jest-environment node */

const { parseExpenseInput, canDecideExpense, expenseStageFor } = require('@/lib/expense-rules');

const base = {
    category: 'FOOD',
    amount: 450.5,
    fromDate: '2030-11-10',
    toDate: '2030-11-12',
    journeyStartDate: '2030-11-10',
    clientLocation: 'Bengaluru',
    projectName: 'Atlas',
    receiptAvailable: false,
    receiptNote: 'Street vendor, no bill',
};
const fail = (over, text) => expect(() => parseExpenseInput({ ...base, ...over })).toThrow(text);

describe('parseExpenseInput', () => {
    test('accepts a valid claim without a bill when a note is given', () => {
        const out = parseExpenseInput(base);
        expect(out).toMatchObject({ category: 'FOOD', amount: 450.5, travelMode: null, receiptUrl: null, receiptNote: 'Street vendor, no bill' });
        expect(out.fromKey).toBe('2030-11-10');
    });

    test('travel needs a mode; Other needs typed text', () => {
        fail({ category: 'TRAVEL' }, 'mode of transport');
        fail({ category: 'TRAVEL', travelMode: 'TAXI' }, 'mode of transport');
        fail({ category: 'TRAVEL', travelMode: 'OTHER' }, 'Please enter the mode of transport');
        expect(parseExpenseInput({ ...base, category: 'TRAVEL', travelMode: 'FLIGHT' }).travelMode).toBe('FLIGHT');
        const other = parseExpenseInput({ ...base, category: 'TRAVEL', travelMode: 'OTHER', travelModeOther: 'Metro' });
        expect(other.travelModeOther).toBe('Metro');
    });

    test('travel mode is dropped for non-travel categories', () => {
        const out = parseExpenseInput({ ...base, category: 'FOOD', travelMode: 'FLIGHT' });
        expect(out.travelMode).toBeNull();
        expect(out.travelModeOther).toBeNull();
    });

    test('amount must be a positive number within the limit and is rounded to 2 decimals', () => {
        fail({ amount: 0 }, 'greater than 0');
        fail({ amount: -5 }, 'greater than 0');
        fail({ amount: 'abc' }, 'number');
        fail({ amount: 99999999999 }, 'too large');
        expect(parseExpenseInput({ ...base, amount: '10.456' }).amount).toBe(10.46);
    });

    test('date rules', () => {
        fail({ toDate: '2030-11-09' }, 'To date cannot be before From date');
        fail({ journeyStartDate: '2030-11-13' }, 'Journey start date cannot be after the To date');
        fail({ fromDate: '2026-02-30' }, 'Invalid date');
        // journey may start before the expense period
        expect(parseExpenseInput({ ...base, journeyStartDate: '2030-11-08' }).journeyKey).toBe('2030-11-08');
    });

    test('past dates are not allowed; today and future dates are', () => {
        const input = { ...base, fromDate: '2030-11-10', toDate: '2030-11-12', journeyStartDate: '2030-11-10' };
        // on the first day itself the claim is still valid
        expect(parseExpenseInput(input, new Date('2030-11-10T10:00:00+05:30')).fromKey).toBe('2030-11-10');
        // the day after the journey start date is already "past"
        expect(() => parseExpenseInput(input, new Date('2030-11-11T10:00:00+05:30'))).toThrow('Past dates are not allowed');
        // any one of the three dates being in the past is enough to refuse
        expect(() => parseExpenseInput({ ...input, journeyStartDate: '2030-11-09' }, new Date('2030-11-10T10:00:00+05:30'))).toThrow('Past dates are not allowed');
        expect(() => parseExpenseInput({ ...input, fromDate: '2020-01-01', toDate: '2020-01-02', journeyStartDate: '2020-01-01' })).toThrow('Past dates are not allowed');
    });

    test('required text fields', () => {
        fail({ clientLocation: '   ' }, 'Client location is required');
        fail({ projectName: '' }, 'Project name is required');
        fail({ category: 'GIFTS' }, 'valid expense category');
    });

    test('bill: file when available, note when not', () => {
        fail({ receiptAvailable: true }, 'upload the bill');
        fail({ receiptAvailable: true, receiptUrl: '/uploads/profiles/x.png' }, 'upload the bill');
        fail({ receiptAvailable: true, receiptUrl: '/uploads/receipts/../x.png' }, 'upload the bill');
        fail({ receiptAvailable: false, receiptNote: '  ' }, 'note');
        fail({ receiptAvailable: undefined }, 'bill');
        const ok = parseExpenseInput({ ...base, receiptAvailable: true, receiptUrl: '/uploads/receipts/a.pdf', receiptNote: 'ignored' });
        expect(ok).toMatchObject({ receiptUrl: '/uploads/receipts/a.pdf', receiptNote: null });
    });
});

describe('canDecideExpense', () => {
    const claim = { userId: 'e1', managerId: 'm1', status: 'PENDING' };
    test('only the assigned manager, only while pending', () => {
        expect(canDecideExpense(claim, { id: 'm1', role: 'MANAGER' })).toBe(true);
        expect(canDecideExpense(claim, { id: 'm2', role: 'MANAGER' })).toBe(false);
        expect(canDecideExpense(claim, { id: 'h1', role: 'ADMIN' })).toBe(false);
        expect(canDecideExpense({ ...claim, status: 'APPROVED' }, { id: 'm1', role: 'MANAGER' })).toBe(false);
    });
    test('never your own claim; admin only when the manager is gone', () => {
        expect(canDecideExpense({ ...claim, managerId: 'm1', userId: 'm1' }, { id: 'm1', role: 'MANAGER' })).toBe(false);
        expect(canDecideExpense({ ...claim, managerId: null }, { id: 'h1', role: 'ADMIN' })).toBe(true);
        expect(canDecideExpense({ ...claim, managerId: null }, { id: 'm1', role: 'MANAGER' })).toBe(false);
    });
});

describe('HR step (MANAGER_APPROVED)', () => {
    const claim = { userId: 'e1', managerId: 'm1', status: 'MANAGER_APPROVED' };
    test('only HR (admin) can decide after the manager accepted', () => {
        expect(canDecideExpense(claim, { id: 'h1', role: 'ADMIN' })).toBe(true);
        expect(expenseStageFor(claim, { id: 'h1', role: 'ADMIN' })).toBe('HR');
        expect(canDecideExpense(claim, { id: 'm1', role: 'MANAGER' })).toBe(false);
        expect(canDecideExpense({ ...claim, userId: 'h1' }, { id: 'h1', role: 'ADMIN' })).toBe(false);
    });
    test('nobody can decide a final claim', () => {
        expect(canDecideExpense({ ...claim, status: 'APPROVED' }, { id: 'h1', role: 'ADMIN' })).toBe(false);
        expect(canDecideExpense({ ...claim, status: 'REJECTED' }, { id: 'h1', role: 'ADMIN' })).toBe(false);
    });
});
