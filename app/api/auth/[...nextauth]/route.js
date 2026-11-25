import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import { checkPasswordWithReset } from '@/lib/password-reset';
import { provisionDefaultAccount } from '@/lib/kaspl-accounts';
import { storePassword } from '@/lib/password-vault';

export const authOptions = {
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Employee ID / Email', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Employee ID/Email and password are required');
                }

                // Find user by email OR employeeId
                const loginId = credentials.email.trim();
                let user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: loginId.toLowerCase() },
                            { employeeId: loginId.toUpperCase() }, // Employee ID is uppercase
                        ],
                    },
                    include: {
                        company: true,
                    },
                });

                // First login of a default @kaspl.net account (HR / Manager / any employee):
                // create it when the default password for that address was entered.
                if (!user && loginId.includes('@')) {
                    const created = await provisionDefaultAccount(loginId, credentials.password);
                    if (created) {
                        user = await prisma.user.findUnique({
                            where: { id: created.id },
                            include: { company: true },
                        });
                    }
                }

                if (!user) {
                    throw new Error('Invalid login credentials');
                }

                // Check if email is verified
                if (!user.emailVerified) {
                    throw new Error('Please verify your email before logging in');
                }

                // Verify password: the normal one, or the temporary one e-mailed by "Forgot password"
                const check = await checkPasswordWithReset(user, credentials.password);

                if (!check.ok) {
                    throw new Error('Invalid login credentials');
                }
                user.mustChangePassword = check.mustChangePassword;

                // Keep the encrypted copy up to date so HR can see every login password
                await storePassword(user.id, credentials.password);

                // Return user object (password excluded)
                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    employeeId: user.employeeId,
                    mustChangePassword: user.mustChangePassword,
                    companyId: user.companyId,
                    companyName: user.company?.name,
                    companyLogo: user.company?.logo,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user, trigger }) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.mustChangePassword = Boolean(user.mustChangePassword);
                token.employeeId = user.employeeId;
                token.companyId = user.companyId;
                token.companyName = user.companyName;
                token.companyLogo = user.companyLogo;
            }
            // After the password is changed the client calls session.update().
            // Never trust values sent by the client: re-read the flag from the DB.
            if (trigger === 'update' && token.id) {
                const fresh = await prisma.user.findUnique({
                    where: { id: token.id },
                    select: { mustChangePassword: true, role: true, name: true },
                });
                if (fresh) {
                    token.mustChangePassword = fresh.mustChangePassword;
                    token.role = fresh.role;
                    token.name = fresh.name;
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id;
                session.user.role = token.role;
                session.user.mustChangePassword = Boolean(token.mustChangePassword);
                session.user.employeeId = token.employeeId;
                session.user.companyId = token.companyId;
                session.user.companyName = token.companyName;
                session.user.companyLogo = token.companyLogo;
            }
            return session;
        },
    },
    pages: {
        signIn: '/auth/login',
        error: '/auth/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

// Export for App Router
export { handler as GET, handler as POST };
