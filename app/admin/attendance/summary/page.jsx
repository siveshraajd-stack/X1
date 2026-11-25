'use client';

import Link from 'next/link';
import { PageShell } from '@/components/ui/page-shell';
import { AttendanceSummaryTable } from '@/components/attendance/summary-table';

export default function AdminAttendanceSummaryPage() {
    return (
        <PageShell admin title="Monthly Summary">
            <div className="space-y-4 max-w-5xl">
                <Link href="/admin/attendance" className="inline-block px-4 py-2 border border-gray-200 text-[10px] font-bold uppercase tracking-wide hover:bg-primary-800 hover:text-white">← Daily registry</Link>
                <AttendanceSummaryTable />
            </div>
        </PageShell>
    );
}
