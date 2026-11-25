import { z } from 'zod';
import { detailsSchema } from './employee-details';

// Password rule for temporary / new passwords:
// min 8 characters, at least 1 uppercase letter, 1 number and 1 special character.
export const passwordRule = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// HR Signup validation schema (Company + HR User)
export const hrSignupSchema = z.object({
    // Company Information
    companyName: z.string().min(2, 'Company name must be at least 2 characters'),

    // HR User Information
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address').toLowerCase(),
    phone: z.string().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
});

// Login validation schema
export const loginSchema = z.object({
    email: z.string().min(1, 'Email is required'),
    password: z.string().min(1, 'Password is required'),
});

// Change password (forced first-login change and the permanent profile option)
export const changePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, 'Old password is required'),
        newPassword: passwordRule,
        confirmPassword: z.string().min(1, 'Please confirm your new password'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    })
    .refine((data) => data.newPassword !== data.oldPassword, {
        message: 'New password must be different from the old password',
        path: ['newPassword'],
    });

// Add employee validation schema (admin)
export const addEmployeeSchema = z.object({
    // Required personal information
    firstName: z.string().trim().min(2, 'First name is required'),
    lastName: z.string().trim().min(2, 'Last name is required'),
    email: z
        .string({ required_error: 'Employee email is required' })
        .trim()
        .min(1, 'Employee email is required')
        .email('Employee email is not a valid email address')
        .toLowerCase(),

    // Temporary password set by the admin; the employee must change it on first login
    // (ignored if sent: every new account starts with DEFAULT_TEMP_PASSWORD)
    password: z.string().optional(),

    // Role of the new account (managers can approve leave for their reports)
    role: z.enum(['EMPLOYEE', 'TEAM_LEAD', 'MANAGER']).default('EMPLOYEE'),

    // Required reporting line
    managerId: z.string({ required_error: 'Please select a manager' }).min(1, 'Please select a manager'),
    managerEmail: z
        .string({ required_error: "Manager's email is required" })
        .trim()
        .min(1, "Manager's email is required")
        .email("Manager's email is not a valid email address")
        .toLowerCase(),

    // Required job details
    jobPosition: z.string().trim().min(2, 'Job position is required'),
    department: z.string().trim().min(2, 'Department is required'),
    dateOfJoining: z.string().min(1, 'Date of joining is required'),

    // Optional fields
    biometricId: z.string().trim().max(40, 'Biometric ID is too long').optional().or(z.literal('')),
    phone: z.string().regex(/^[0-9]{10}$/, 'Phone number must be 10 digits').optional().or(z.literal('')),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    maritalStatus: z.string().optional(),
    personalEmail: z.string().trim().email('Personal e-mail is not a valid email address').optional().or(z.literal('')),
    nationality: z.string().optional(),
    residingAddress: z.string().optional(),
    parentName: z.string().trim().optional().or(z.literal('')),
    parentPhone: z.string().regex(/^[0-9]{10}$/, 'Parent phone number must be 10 digits').optional().or(z.literal('')),
    workLocation: z.string().optional(),

    // Yearly Sick / Casual leave quota (HR sets it; the employee never sees it)
    sickLeaveQuota: z.coerce.number().int('Sick leave must be a whole number').min(0, 'Sick leave cannot be negative').max(60, 'Sick leave is too high').optional(),
    casualLeaveQuota: z.coerce.number().int('Casual leave must be a whole number').min(0, 'Casual leave cannot be negative').max(60, 'Casual leave is too high').optional(),

    // Personal / family / PF / academic / experience / bank / document details
    details: detailsSchema.optional(),
});
