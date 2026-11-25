'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { StaffNameSection } from '@/components/profile/staff-name-section';
import { EmployeeHero } from '@/components/profile/employee-hero';
import { EmployeeSections } from '@/components/profile/employee-sections';

export default function AdminProfilePage() {
    const { data: session } = useSession();
    const [loggingOut, setLoggingOut] = useState(false);
    const [data, setData] = useState(null);

    // Same header + 7 sections as every other profile
    useEffect(() => {
        if (!session?.user?.id) return;
        fetch(`/api/profile/${session.user.id}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((d) => setData(d))
            .catch(() => setData(null));
    }, [session?.user?.id]);

    const employee = {
        ...(data?.user || { id: session?.user?.id, name: session?.user?.name, email: session?.user?.email }),
        profile: data?.profile || {},
        jobDetails: data?.jobDetails || {},
        documents: data?.documents || [],
        sensitive: data?.sensitive,
    };

    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await signOut({ redirect: false });
        } finally {
            // Always land on the login page
            window.location.href = '/auth/login';
        }
    };

    return (
        <div className="min-h-screen flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8">
                <div className="mb-10">
                    <h1 className="text-4xl font-bold text-gray-900 uppercase tracking-tight ">HR Profile</h1>
                </div>

                <EmployeeHero
                    employee={employee}
                    right={
                        session?.user?.id ? (
                            <Link href={`/admin/employees/${session.user.id}/edit`} className="px-6 py-3 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-primary-800 shrink-0">
                                Edit Profile
                            </Link>
                        ) : null
                    }
                />

                <div className="mt-10">
                    <EmployeeSections employee={employee} />
                </div>

                <div className="border border-gray-200 bg-white shadow-sm p-10 mt-10">
                    {/* Name section: employees see every notification / approval as coming from this name */}
                    <div className="mb-12">
                        <StaffNameSection />
                    </div>

                    {/* Sign Out Button */}
                    <div className="border-t-2 border-gray-200 pt-8">
                        <button
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="px-10 py-4 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wider border border-gray-200 shadow-sm hover:shadow-none transition-all flex items-center gap-3 active:translate-x-1 active:translate-y-1"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            {loggingOut ? 'LOGGING OUT...' : 'LOG OUT'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
