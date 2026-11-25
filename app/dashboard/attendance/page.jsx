'use client';

import { PageShell } from '@/components/ui/page-shell';
import { MonthCalendar } from '@/components/attendance/month-calendar';

export default function EmployeeAttendancePage() {
    return (
        <PageShell title="My Attendance" showDate={false} fill>
            <MonthCalendar endpoint="/api/attendance/calendar" editable fill />
        </PageShell>
    );
}
