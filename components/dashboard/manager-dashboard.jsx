'use client';

import Link from 'next/link';
import { DashboardFrame, MyWork } from '@/components/dashboard/dashboard-frame';
import { useTeamOverview } from '@/components/dashboard/use-team-overview';
import { AttendanceSummaryTable } from '@/components/attendance/summary-table';
import { Approvals, Holidays, Roster, Section, StatTile, StatusChip, TodayBar, TrendBars, UpcomingLeaves } from '@/components/dashboard/team-widgets';
import { formatMinutes } from '@/lib/work-hours';

/** Dashboard for a company Manager: everybody under them, their team leads, approvals and reports. */
export function ManagerDashboard() {
    const { data, error, reload } = useTeamOverview();

    return (
        <DashboardFrame roleLabel="Manager">
            {error ? <div className="k-card px-5 py-3 mb-6 text-sm font-semibold text-red-600 !bg-red-50">{error}</div> : null}
            {!data && !error ? (
                <div className="k-card p-10 text-center text-sm font-semibold text-[var(--ink-soft)]">Loading...</div>
            ) : null}
            {data ? (
                <div className="space-y-6">
                    {/* Numbers for today */}
                    <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 k-rise k-rise-2">
                        <StatTile label="People" value={data.today.total} hint={`${data.teamLeads?.length || 0} team lead${data.teamLeads?.length === 1 ? '' : 's'}`} />
                        <StatTile label="In today" value={data.today.here} hint={`${data.today.wfh} WFH · ${data.today.od} OD`} tone="text-secondary-600" />
                        <StatTile label="On leave" value={data.today.leave} tone="text-primary-600" />
                        <StatTile label="Absent" value={data.today.absent} hint={data.today.late ? `${data.today.late} late` : data.today.offDayReason || ''} tone="text-red-600" />
                        <StatTile label="Waiting for me" value={data.pending.leaves + data.pending.expenses} hint={`${data.pending.leaves} leave · ${data.pending.expenses} expense`} href="/dashboard/team" tone="text-amber-600" />
                    </div>

                    {/* Approvals + who is away */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Section
                            title={`Approvals${data.pending.leaves + data.pending.expenses ? ` (${data.pending.leaves + data.pending.expenses})` : ''}`}
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

                    {/* Team leads */}
                    <Section title="Team leads">
                        {data.teamLeads?.length ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {data.teamLeads.map((lead) => (
                                    <div key={lead.id} className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm truncate">{lead.name}</p>
                                                <p className="text-[11px] text-[var(--ink-soft)]">{lead.employeeId}</p>
                                            </div>
                                            <StatusChip status={lead.status} />
                                        </div>
                                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                            <div><p className="text-xl font-bold">{lead.teamSize}</p><p className="text-[10px] font-bold text-[var(--ink-soft)]">TEAM</p></div>
                                            <div><p className="text-xl font-bold text-secondary-600">{lead.here}</p><p className="text-[10px] font-bold text-[var(--ink-soft)]">IN</p></div>
                                            <div><p className="text-xl font-bold text-primary-600">{lead.onLeave}</p><p className="text-[10px] font-bold text-[var(--ink-soft)]">LEAVE</p></div>
                                        </div>
                                        {lead.waitingWithLead ? <p className="mt-3 text-[11px] font-bold text-amber-600">{lead.waitingWithLead} request{lead.waitingWithLead === 1 ? '' : 's'} waiting with {lead.name.split(' ')[0]}</p> : null}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-[var(--ink-soft)]">No team leads yet</p>
                        )}
                    </Section>

                    {/* Attendance picture */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Section title="Today" className="xl:col-span-1">
                            <TodayBar today={data.today} />
                            <p className="mt-5 text-[11px] font-bold text-[var(--ink-soft)]">TEAM HOURS THIS WEEK</p>
                            <p className="text-2xl font-bold">{formatMinutes(data.weekMinutes)}</p>
                        </Section>
                        <Section title="Last 7 working days" className="xl:col-span-1">
                            <TrendBars trend={data.trend} total={data.today.total} />
                        </Section>
                        <Section title="Departments" className="xl:col-span-1">
                            {data.departments?.length ? (
                                <ul className="space-y-3">
                                    {data.departments.map((d) => (
                                        <li key={d.name}>
                                            <div className="flex justify-between text-xs font-bold"><span className="truncate">{d.name}</span><span>{d.here}/{d.total}</span></div>
                                            <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-700" style={{ width: `${d.total ? (d.here / d.total) * 100 : 0}%` }} /></div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-[var(--ink-soft)]">No departments</p>
                            )}
                        </Section>
                    </div>

                    <Section title="Everyone today" action={<Link href="/dashboard/team?tab=profiles" className="text-xs font-bold text-primary-600 hover:underline">Profiles</Link>}>
                        <Roster roster={data.roster} showRole profileHref="/dashboard/team" />
                    </Section>

                    <Section title="Monthly attendance"><AttendanceSummaryTable emptyText="No employees" /></Section>
                </div>
            ) : null}

            <div className="mt-10">
                <h2 className="k-title text-2xl mb-4">My work</h2>
                <MyWork />
            </div>
        </DashboardFrame>
    );
}
