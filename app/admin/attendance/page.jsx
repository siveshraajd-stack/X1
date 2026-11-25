'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { AdminSidebar } from '@/components/admin/admin-sidebar';

export default function AdminAttendancePage() {
    const { data: session } = useSession();
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
    // 'all' = daily registry; present / leave / od / wfh / absent = live status for today
    const [view, setView] = useState('all');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const v = new URLSearchParams(window.location.search).get('view');
        if (['present', 'leave', 'od', 'wfh', 'absent'].includes(v)) setView(v);
        setReady(true);
    }, []);

    const changeView = (v) => {
        setView(v);
        window.history.replaceState(null, '', v === 'all' ? '/admin/attendance' : `/admin/attendance?view=${v}`);
    };

    const fetchAttendance = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const params = new URLSearchParams({
                date: currentDate,
                search: search
            });
            if (view !== 'all') { params.delete('date'); params.set('view', view); }
            const url = view === 'all' ? `/api/attendance?${params.toString()}` : `/api/admin/today-status?${params.toString()}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setAttendance(data.attendance);
            }
        } catch (err) {
            console.error('Failed to fetch admin attendance:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!session || !ready) return;
        fetchAttendance();
        // live status: refresh every 15 seconds while a today-view is open
        if (view === 'all') return;
        const timer = setInterval(() => fetchAttendance(true), 15000);
        return () => clearInterval(timer);
    }, [session, ready, currentDate, search, view]);

    const tabs = [['all', 'Daily register'], ['present', 'Present'], ['leave', 'On leave'], ['od', 'On duty'], ['wfh', 'Work from home'], ['absent', 'Absent']];

    return (
        <div className="min-h-screen flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8">
                <div className="space-y-6">
                    <div className="mb-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                            <div>
                                <h1 className="text-4xl font-bold text-gray-900 uppercase tracking-tight mb-2 underline underline-offset-8 decoration-4 decoration-primary-500">Attendance Management</h1>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <Link href="/admin/attendance/summary" className="inline-block px-4 py-2 border border-gray-200 text-[10px] font-bold uppercase tracking-wide hover:bg-primary-800 hover:text-white">Monthly summary →</Link>
                                    {tabs.map(([key, label]) => (
                                        <button key={key} onClick={() => changeView(key)} className={`px-4 py-2 border border-gray-200 text-[10px] font-bold uppercase tracking-wide hover:bg-primary-800 hover:text-white ${view === key ? 'bg-primary-800 text-white' : 'bg-white'}`}>{label}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="relative flex-1 max-w-md">
                                <input
                                    type="text"
                                    placeholder="Search name or ID"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 text-[10px] font-bold border border-gray-200 outline-none placeholder:text-gray-300 bg-white shadow-sm focus:shadow-none transition-all uppercase tracking-wide"
                                />
                                <svg className="w-5 h-5 text-gray-900 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            {view === 'all' ? (
                            <div className="flex items-center gap-4 bg-white px-4 py-3 border border-gray-200 shadow-sm w-fit">
                                <span className="text-[10px] font-bold text-gray-400 uppercase ">Date:</span>
                                <input
                                    type="date"
                                    value={currentDate}
                                    onChange={(e) => setCurrentDate(e.target.value)}
                                    className="bg-transparent outline-none text-[10px] font-bold uppercase"
                                />
                            </div>
                            ) : (
                            <div className="flex items-center gap-2 bg-white px-4 py-3 border border-gray-200 shadow-sm w-fit">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Live · today</span>
                            </div>
                            )}
                        </div>
                    </div>

                    <div className="border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-primary-700 text-white shrink-0">
                                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-wide border-r border-white/20">Employee</th>
                                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-wide border-r border-white/20">Biometric In</th>
                                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-wide border-r border-white/20">Biometric Out</th>
                                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-wide border-r border-white/20">Clock In</th>
                                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-wide border-r border-white/20">Clock Out</th>
                                    <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-wide text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-[10px]">
                                {loading ? (
                                    <tr><td colSpan="6" className="px-8 py-20 text-center text-gray-400 tracking-wider animate-pulse">POOLING DATA FROM SECURE_SERVER...</td></tr>
                                ) : attendance.length === 0 ? (
                                    <tr><td colSpan="6" className="px-8 py-20 text-center text-gray-400 font-bold uppercase tracking-wide">No records</td></tr>
                                ) : (
                                    attendance.map((record) => (
                                        <tr key={record.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-8 py-5 border-r border-gray-200">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-gray-900 ">{record.user?.name}</span>
                                                    <span className="text-[8px] text-gray-400 mt-1 uppercase">{record.user?.employeeId}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 border-r border-gray-200 font-bold text-primary-600 ">
                                                {record.checkIn ? new Date(record.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '--'}
                                            </td>
                                            <td className="px-8 py-5 border-r border-gray-200 font-bold text-red-600 ">
                                                {record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '--'}
                                            </td>
                                            <td className="px-8 py-5 border-r border-gray-200 font-bold text-gray-700 ">
                                                {record.clockIn ? new Date(record.clockIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '--'}
                                            </td>
                                            <td className="px-8 py-5 border-r border-gray-200 font-bold text-gray-700 ">
                                                {record.clockOut ? new Date(record.clockOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '--'}
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <div className={`inline-flex px-3 py-1 border border-gray-200 font-bold uppercase text-[8px] tracking-wider shadow-sm ${{ PRESENT: 'bg-green-500 text-white', LATE: 'bg-primary-500 text-white', WFH: 'bg-teal-500 text-white', OD: 'bg-primary-600 text-white', LEAVE: 'bg-amber-500 text-white' }[String(record.status).toUpperCase()] || 'bg-red-500 text-white'}`}>
                                                    {record.status}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
