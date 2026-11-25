'use client';

import { useSession, signOut } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { PageShell } from '@/components/ui/page-shell';
import { StaffNameSection } from '@/components/profile/staff-name-section';
import { EmployeeHero } from '@/components/profile/employee-hero';
import { EmployeeSections } from '@/components/profile/employee-sections';

const fmtDate = (value) =>
    value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '-';

function Field({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="k-label mb-1">{label}</p>
            <p className="text-sm font-semibold break-words">{value || '-'}</p>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <section className="k-card p-6">
            <p className="k-label mb-4">{title}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-8 gap-y-5">{children}</div>
        </section>
    );
}

export default function ProfilePage() {
    const { data: session } = useSession();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = useCallback(async () => {
        if (!session?.user?.id) return;
        try {
            const response = await fetch(`/api/profile/${session.user.id}`);
            if (response.ok) setProfile(await response.json());
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    }, [session?.user?.id]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    // Managers / team leads (and HR) can set the name their notifications come from
    const isStaff = ['TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(session?.user?.role);

    const user = profile?.user || {};
    const p = profile?.profile || {};
    const job = profile?.jobDetails || {};
    // One flat object for the shared header + 7 sections
    const employee = { ...user, profile: p, jobDetails: job, documents: profile?.documents || [], sensitive: profile?.sensitive };

    const logout = (
        <button onClick={() => signOut({ callbackUrl: '/' })} className="k-btn !bg-red-600 hover:!bg-red-700">
            LOG OUT
        </button>
    );

    return (
        <PageShell title="My Profile" actions={logout}>
            {loading ? (
                <p className="text-sm font-semibold text-[var(--ink-soft)]">Loading...</p>
            ) : !profile ? (
                <p className="text-sm font-semibold text-[var(--ink-soft)]">Not found</p>
            ) : (
                <div className="w-full space-y-5">
                    <EmployeeHero employee={employee} />

                    {isStaff && <StaffNameSection onSaved={loadProfile} />}

                    <EmployeeSections employee={employee} />

                    {(p.about || p.jobLoves || p.interestsHobbies) && (
                        <Section title="About">
                            {p.about && <Field label="About" value={p.about} />}
                            {p.jobLoves && <Field label="Job" value={p.jobLoves} />}
                            {p.interestsHobbies && <Field label="Interests" value={p.interestsHobbies} />}
                        </Section>
                    )}
                </div>
            )}
        </PageShell>
    );
}
