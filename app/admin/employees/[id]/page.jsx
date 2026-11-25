'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { MonthCalendar } from '@/components/attendance/month-calendar';
import { EmployeeHero } from '@/components/profile/employee-hero';
import { EmployeeSections } from '@/components/profile/employee-sections';

export default function EmployeeDetailPage() {
    const { data: session } = useSession();
    const params = useParams();
    const router = useRouter();
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('resume');
    const [editingAbout, setEditingAbout] = useState(false);
    const [aboutForm, setAboutForm] = useState({ about: '', jobLoves: '', interestsHobbies: '' });
    const [aboutSaving, setAboutSaving] = useState(false);
    const [aboutError, setAboutError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            const resolvedParams = await params;
            if (resolvedParams.id) {
                fetchEmployee(resolvedParams.id);
            }
        };
        fetchData();
    }, [params]);

    const fetchEmployee = async (id) => {
        try {
            const response = await fetch(`/api/admin/employees/${id}`);
            const data = await response.json();
            setEmployee(data.employee);
        } catch (error) {
            console.error('Failed to fetch employee:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block w-12 h-12 border border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-600">Loading employee details...</p>
                </div>
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-600">Employee not found.</p>
            </div>
        );
    }

    const isAdmin = session?.user?.role === 'ADMIN';

    const startEditAbout = () => {
        setAboutForm({
            about: employee.profile?.about || '',
            jobLoves: employee.profile?.jobLoves || '',
            interestsHobbies: employee.profile?.interestsHobbies || '',
        });
        setAboutError('');
        setEditingAbout(true);
    };

    const saveAbout = async () => {
        setAboutSaving(true);
        setAboutError('');
        try {
            const res = await fetch(`/api/admin/employees/${employee.id}/about`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(aboutForm),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save');
            setEmployee((prev) => ({ ...prev, profile: { ...(prev.profile || {}), ...data.profile } }));
            setEditingAbout(false);
        } catch (err) {
            setAboutError(err.message);
        } finally {
            setAboutSaving(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8">
                <div className="mb-10">
                    <button
                        onClick={() => router.back()}
                        className="text-[10px] font-bold uppercase tracking-wide border border-gray-200 px-6 py-2 shadow-sm hover:shadow-none transition-all mb-8 flex items-center gap-3 bg-white"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to employees
                    </button>

                    <EmployeeHero
                        employee={employee}
                        right={
                            <div className="flex flex-col items-center gap-3">
                                <div className={`px-6 py-3 border border-gray-200 text-center shadow-sm ${employee.attendance?.some(a => new Date(a.date).toDateString() === new Date().toDateString())
                                    ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                    }`}>
                                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1">Today</p>
                                    <p className="text-lg font-bold uppercase">
                                        {employee.attendance?.some(a => new Date(a.date).toDateString() === new Date().toDateString()) ? 'Present' : 'Away'}
                                    </p>
                                </div>
                            </div>
                        }
                    />
                </div>

                {/* Tabs */}
                <div className="flex bg-white border border-gray-200 mb-10 shadow-sm overflow-hidden">
                    {[
                        { id: 'resume', label: 'About', color: 'bg-primary-600' },
                        { id: 'private', label: 'Private Info', color: 'bg-red-600' },
                        { id: 'attendance', label: 'Attendance', color: 'bg-primary-700' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 px-8 py-5 text-[10px] font-bold uppercase tracking-wider transition-all border-r last:border-r-0 border-gray-200 ${activeTab === tab.id
                                ? `text-white ${tab.color} shadow-inner`
                                : 'text-gray-900 hover:bg-gray-50'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="p-8">
                    {/* About Tab (tab id stays "resume") */}
                    {activeTab === 'resume' && (() => {
                        const aboutSections = [
                            { title: 'ABOUT', field: 'about', content: employee.profile?.about },
                            { title: 'Job I Love', field: 'jobLoves', content: employee.profile?.jobLoves },
                            { title: 'Hobbies', field: 'interestsHobbies', content: employee.profile?.interestsHobbies },
                        ];
                        return (
                            <div className="space-y-10">
                                {/* 1 Personal, 2 Family, 3 PF, 4 Academic, 5 Experience, 6 Bank, 7 Documents */}
                                <EmployeeSections employee={employee} />

                                {isAdmin && (
                                    <div className="flex items-center justify-end gap-3">
                                        {aboutError && <p className="text-[10px] font-bold text-red-600 mr-auto">{aboutError}</p>}
                                        {editingAbout ? (
                                            <>
                                                <button
                                                    onClick={saveAbout}
                                                    disabled={aboutSaving}
                                                    className="px-6 py-2 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wide border border-gray-200 disabled:opacity-50"
                                                >
                                                    {aboutSaving ? 'SAVING...' : 'SAVE ABOUT'}
                                                </button>
                                                <button
                                                    onClick={() => setEditingAbout(false)}
                                                    disabled={aboutSaving}
                                                    className="px-6 py-2 bg-white text-gray-900 text-[10px] font-bold uppercase tracking-wide border border-gray-200"
                                                >
                                                    CANCEL
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={startEditAbout}
                                                className="px-6 py-2 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wide border border-gray-200"
                                            >
                                                EDIT ABOUT
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                                    {aboutSections.map((section) => (
                                        <div key={section.title} className="border border-gray-200 bg-white p-8 shadow-sm">
                                            <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider mb-4 underline">{section.title}</h3>
                                            {editingAbout ? (
                                                <textarea
                                                    value={aboutForm[section.field]}
                                                    onChange={(e) => setAboutForm((f) => ({ ...f, [section.field]: e.target.value }))}
                                                    rows={6}
                                                    maxLength={3000}
                                                    className="w-full px-3 py-2 border border-gray-200 text-xs outline-none focus:bg-gray-50"
                                                />
                                            ) : (
                                                <p className="text-xs font-bold leading-relaxed text-gray-500 whitespace-pre-line">
                                                    {section.content || 'Not provided'}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                            </div>
                        );
                    })()}

                    {/* Private Info Tab */}
                    {activeTab === 'private' && (
                        <div className="border border-gray-200 bg-white shadow-sm overflow-hidden">
                            <div className="bg-primary-700 text-white px-8 py-4 flex justify-between items-center ">
                                <h3 className="text-[10px] font-bold uppercase tracking-wider">Private Info</h3>
                                <div className="flex gap-2">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                    <p className="text-[8px] font-bold uppercase">Private</p>
                                </div>
                            </div>
                            <div className="p-10 grid grid-cols-1 md:grid-cols-3 gap-10">
                                {[
                                    { label: 'Date of Birth', value: employee.profile?.dateOfBirth ? new Date(employee.profile.dateOfBirth).toLocaleDateString() : 'N/A' },
                                    { label: 'Gender', value: employee.profile?.gender },
                                    { label: 'Marital Status', value: employee.profile?.maritalStatus },
                                    { label: 'Nationality', value: employee.profile?.nationality },
                                    { label: 'Parent Name', value: employee.profile?.parentName },
                                    { label: 'Parent Phone', value: employee.profile?.parentPhone },
                                    { label: 'Address', value: employee.profile?.residingAddress, fullWidth: true }
                                ].map((field, idx) => (
                                    <div key={idx} className={`${field.fullWidth ? 'md:col-span-3' : ''} border-b border-gray-200/10 pb-4`}>
                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2">{field.label}</p>
                                        <p className="text-sm font-bold text-gray-900 uppercase tracking-tight">{field.value || 'Not provided'}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Attendance Calendar Tab */}
                    {activeTab === 'attendance' && (
                        <MonthCalendar endpoint={`/api/admin/employees/${employee.id}/attendance`} />
                    )}

                </div>
            </main>
        </div>
    );
}
