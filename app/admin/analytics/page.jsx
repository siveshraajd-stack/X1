'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';

export default function AnalyticsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === 'loading') return;
        if (!session) {
            router.push('/auth/signin');
        } else if (session.user.role === 'EMPLOYEE') {
            router.push('/dashboard');
        }
    }, [session, status, router]);

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-200"></div>
            </div>
        );
    }

    if (!session || session.user.role === 'EMPLOYEE') {
        return null;
    }

    return (
        <div className="min-h-screen flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8">
                <AnalyticsDashboard />
            </main>
        </div>
    );
}
