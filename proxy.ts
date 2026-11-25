import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const CHANGE_PASSWORD_PAGE = '/auth/change-password';

// Pages that need no login
const publicRoutes = ['/auth/login', '/auth/register', '/auth/verify-email', '/auth/forgot-password'];
// Pages reachable with or without login (one-time email links)
const openRoutes = ['/leave-action'];

// API routes that stay usable while a password change is still pending
const apiAllowedWhileLocked = ['/api/auth', '/api/account/change-password'];

export async function proxy(request) {
    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
    });

    const { pathname } = request.nextUrl;

    // ---- API: only enforce the forced password change here; every route does
    // its own authentication/authorization. -------------------------------
    if (pathname.startsWith('/api')) {
        const allowed = apiAllowedWhileLocked.some((p) => pathname.startsWith(p));
        if (token?.mustChangePassword && !allowed) {
            return NextResponse.json(
                { error: 'You must change your password before using the application', code: 'PASSWORD_CHANGE_REQUIRED' },
                { status: 403 }
            );
        }
        return NextResponse.next();
    }

    if (openRoutes.some((route) => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
    const home = token?.role === 'ADMIN' ? '/admin' : '/dashboard';

    // Not logged in
    if (!token) {
        if (isPublicRoute) return NextResponse.next();
        return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Logged in but must change the temporary password first: nothing else is reachable
    if (token.mustChangePassword) {
        if (pathname === CHANGE_PASSWORD_PAGE) return NextResponse.next();
        return NextResponse.redirect(new URL(CHANGE_PASSWORD_PAGE, request.url));
    }

    // Logged in users have no business on the login/register pages
    if (isPublicRoute) {
        return NextResponse.redirect(new URL(home, request.url));
    }

    // Role-based access control
    if (pathname.startsWith('/admin') && token.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match everything except Next.js internals and static files.
         * API routes ARE matched (see the API branch above).
         */
        '/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json)$).*)',
    ],
};
