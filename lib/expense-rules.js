import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { EXPENSE_CATEGORY_KEYS, MAX_EXPENSE_AMOUNT, TRAVEL_MODE_KEYS } from '@/lib/constants';
import { dayKey, normalizeDayKey } from '@/lib/dates';

// Bills are only ever stored by /api/upload (type=receipt) under this folder.
export const RECEIPT_URL_PREFIX = '/uploads/receipts/';

const shape = z.object({
    category: z.enum(EXPENSE_CATEGORY_KEYS, { errorMap: () => ({ message: 'Please select a valid expense category' }) }),
    travelMode: z.string().optional().nullable(),
    travelModeOther: z.string().trim().max(60, 'Mode of transport must be 60 characters or fewer').optional().nullable(),
    amount: z.coerce
        .number({ invalid_type_error: 'Amount must be a number' })
        .refine((n) => Number.isFinite(n), 'Amount must be a number')
        .refine((n) => n > 0, 'Amount must be greater than 0')
        .refine((n) => n <= MAX_EXPENSE_AMOUNT, 'Amount is too large'),
    fromDate: z.string({ required_error: 'From date is required' }).min(1, 'From date is required'),
    toDate: z.string({ required_error: 'To date is required' }).min(1, 'To date is required'),
    journeyStartDate: z.string({ required_error: 'Journey start date is required' }).min(1, 'Journey start date is required'),
    clientLocation: z
        .string({ required_error: 'Client location is required' })
        .trim()
        .min(1, 'Client location is required')
        .max(120, 'Client location must be 120 characters or fewer'),
    projectName: z
        .string({ required_error: 'Project name is required' })
        .trim()
        .min(1, 'Project name is required')
        .max(120, 'Project name must be 120 characters or fewer'),
    receiptAvailable: z.boolean({ required_error: 'Please say whether you have the bill', invalid_type_error: 'Please say whether you have the bill' }),
    receiptUrl: z.string().trim().max(300).optional().nullable(),
    receiptNote: z.string().trim().max(300, 'Note must be 300 characters or fewer').optional().nullable(),
    description: z.string().trim().max(300, 'Description must be 300 characters or fewer').optional().nullable(),
});

/**
 * Validate + normalise a submitted expense claim. Throws AppError(400) on the first problem.
 * Returns the fields ready to store (day keys are returned as keys; the route converts them).
 */
export function parseExpenseInput(raw, now = new Date()) {
    const input = shape.parse(raw);

    // Mode of transport is asked only for Travel
    let travelMode = null;
    let travelModeOther = null;
    if (input.category === 'TRAVEL') {
        if (!input.travelMode || !TRAVEL_MODE_KEYS.includes(input.travelMode)) {
            throw new AppError('Please select the mode of transport (Flight, Train, Bus or Other)', 400);
        }
        travelMode = input.travelMode;
        if (travelMode === 'OTHER') {
            if (!input.travelModeOther) throw new AppError('Please enter the mode of transport', 400);
            travelModeOther = input.travelModeOther;
        }
    }

    const fromKey = normalizeDayKey(input.fromDate);
    const toKey = normalizeDayKey(input.toDate);
    const journeyKey = normalizeDayKey(input.journeyStartDate);
    if (!fromKey || !toKey || !journeyKey) throw new AppError('Invalid date. Use YYYY-MM-DD', 400);
    if (toKey < fromKey) throw new AppError('To date cannot be before From date', 400);
    if (journeyKey > toKey) throw new AppError('Journey start date cannot be after the To date', 400);
    // An OD claim is valid only for today or a future date, never for a day that is already over
    const todayKey = dayKey(now);
    if (fromKey < todayKey || toKey < todayKey || journeyKey < todayKey) {
        throw new AppError('OD dates must be today or a future date. Past dates are not allowed.', 400);
    }

    // Bill: either the uploaded file, or a note explaining why there is none
    let receiptUrl = null;
    let receiptNote = null;
    if (input.receiptAvailable) {
        if (!input.receiptUrl || !input.receiptUrl.startsWith(RECEIPT_URL_PREFIX) || input.receiptUrl.includes('..')) {
            throw new AppError('Please upload the bill', 400);
        }
        receiptUrl = input.receiptUrl;
    } else {
        if (!input.receiptNote) throw new AppError('Please add a note explaining why there is no bill', 400);
        receiptNote = input.receiptNote;
    }

    return {
        category: input.category,
        travelMode,
        travelModeOther,
        amount: Math.round(input.amount * 100) / 100,
        fromKey,
        toKey,
        journeyKey,
        clientLocation: input.clientLocation,
        projectName: input.projectName,
        receiptAvailable: input.receiptAvailable,
        receiptUrl,
        receiptNote,
        description: input.description || null,
    };
}

/**
 * Which step of the approval chain is this claim waiting at, and may this user decide it?
 *   'MANAGER'  PENDING: the assigned reporting manager (an admin only when the manager no longer exists)
 *   'HR'       MANAGER_APPROVED: any HR (ADMIN) once the manager has accepted
 *   null       nobody (own claim, already final, or not your claim)
 */
export function expenseStageFor(claim, user) {
    if (!claim || !user || claim.userId === user.id) return null;
    if (claim.status === 'PENDING') {
        if (claim.managerId === user.id) return 'MANAGER';
        if (user.role === 'ADMIN' && !claim.managerId) return 'MANAGER';
        return null;
    }
    if (claim.status === 'MANAGER_APPROVED') return user.role === 'ADMIN' ? 'HR' : null;
    return null;
}

/** Can this user decide this claim right now? */
export function canDecideExpense(claim, user) {
    return expenseStageFor(claim, user) !== null;
}
