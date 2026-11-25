import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponseParts } from '@/lib/errors';
import { requestPasswordReset } from '@/lib/password-reset';

const schema = z.object({
    email: z.string({ required_error: 'Enter your email or employee ID' }).trim().min(1, 'Enter your email or employee ID'),
});

// POST /api/auth/forgot-password  { email }   (email = work e-mail or employee ID)
// A temporary password is e-mailed to the personal e-mail saved in the profile. The answer is the
// same whether or not an account exists, so this page cannot be used to find out who has an account.
export async function POST(request) {
    try {
        const { email } = schema.parse(await request.json());
        await requestPasswordReset(email);
        return NextResponse.json({
            message:
                'If an account with this email or employee ID has a personal email saved in its profile, a temporary password has been sent there. It is valid for 60 minutes.',
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to send the password email');
        return NextResponse.json(body, { status });
    }
}
