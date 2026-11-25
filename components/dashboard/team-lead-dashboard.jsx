'use client';

import Link from 'next/link';
import { DashboardFrame, MyWork } from '@/components/dashboard/dashboard-frame';
import { useTeamOverview } from '@/components/dashboard/use-team-overview';
import { AttendanceSummaryTable } from '@/components/attendance/summary-table';
import { Approvals, Holidays, Roster, Section, StatTile, TodayBar, TrendBars, UpcomingLeaves } from '@/components/dashboard/team-widgets';
import { formatMinutes } from '@/lib/work-hours';

/** Dashboard for a Team Lead: their direct reports, first-step approvals and team attendance. */
export function TeamLeadDashboard() {
    const { data, error, reload } = useTeamOverview();

    return (
        <DashboardFrame roleLabel="Team Lead">
            {error ? <div className="k-card px-5 py-3 mb-6 text-sm font-semibold text-red-600 !bg-red-50">{error}</div> : null}
            {!data && !error ? (
                <div className="k-card p-10 text-center text-sm font-semibold text-[var(--ink-soft)]">Loading...</div>
            ) : null}
            {data ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 k-rise k-rise-2">
                        <StatTile label="My team" value={data.today.total} />
                        <StatTile label="In today" value={data.today.here} hint={`${data.today.wfh} WFH · ${data.today.od} OD`} tone="text-secondary-600" />
                        <StatTile label="On leave" value={data.today.leave} tone="text-primary-600" />
                        <StatTile label="Absent" value={data.today.absent} hint={data.today.late ? `${data.today.late} late` : data.today.offDayReason || ''} tone="text-red-600" />
                        <StatTile label="Waiting for me" value={data.pending.leaves} hint="leave requests" href="/dashboard/team" tone="text-amber-600" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Section
                            title={`Approvals${data.pending.leaves ? ` (${data.pending.leaves})` : ''}`}
                            action={<Link href="/dashboard/team" className="text-xs font-bold text-primary-600 hover:underline">View all</Link>}
                            className="xl:col-span-2"
                        >
                            <Approvals pending={data.pending} onChanged={reload} />
                        </Section>
                        <div className="space-y-6">
                            <Section title="Away soon"><UpcomingLeaves items={data.upcomingLeaves} /></Section>
                            <Section title="Holidays"><Holidays items={data.holidays} /></Section>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Section title="Today">
                            <TodayBar today={data.today} />
                            <p className="mt-5 text-[11px] font-bold text-[var(--ink-soft)]">TEAM HOURS THIS WEEK</p>
                            <p className="text-2xl font-bold">{formatMinutes(data.weekMinutes)}</p>
                        </Section>
                        <Section title="Last 7 working days">
                            <TrendBars trend={data.trend} total={data.today.total} />
                        </Section>
                    </div>

                    <Section title="My team today" action={<Link href="/dashboard/team?tab=profiles" className="text-xs font-bold text-primary-600 hover:underline">Profiles</Link>}>
                        <Roster roster={data.roster} profileHref="/dashboard/team" />
                    </Section>

                    <Section title="Monthly attendance"><AttendanceSummaryTable emptyText="No employees" /></Section>
                </div>
            ) : null}

            <div className="mt-10">
                <h2 className="k-title text-2xl mb-4">My work</h2>
                <MyWork hideExpense />
            </div>
        </DashboardFrame>
    );
}
