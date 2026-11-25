'use client';

import { SessionProvider } from 'next-auth/react';
import { LeaveToaster } from '@/components/notifications/leave-toaster';

export function Providers({ children }) {
    return (
        <SessionProvider>
            {children}
            <LeaveToaster />
        </SessionProvider>
    );
}
