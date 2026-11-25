'use client';

import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { EmployeeSidebar } from '@/components/employee/employee-sidebar';

const todayLabel = () =>
    new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

/** Common page frame: sidebar + aurora header. `actions` renders on the right of the title. */
export function PageShell({ admin = false, title, actions = null, showDate = true, fill = false, children }) {
    return (
        <div className="min-h-screen flex">
            {admin ? <AdminSidebar /> : <EmployeeSidebar />}
            <main className={`flex-1 ml-64 p-6 lg:p-8 min-w-0 ${fill ? 'h-screen flex flex-col overflow-hidden' : ''}`}>
                <header className={`${fill ? 'mb-4' : 'mb-8'} flex flex-wrap items-end justify-between gap-4 k-rise`}>
                    <div>
                        <h1 className="k-title text-4xl md:text-5xl">{title}</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {actions}
                        {showDate && <span className="k-chip bg-white/70 border border-[var(--line)] text-primary-700">{todayLabel()}</span>}
                    </div>
                </header>
                {fill ? <div className="flex-1 min-h-0">{children}</div> : children}
            </main>
        </div>
    );
}
