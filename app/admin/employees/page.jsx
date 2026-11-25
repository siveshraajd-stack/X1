'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminSidebar } from '@/components/admin/admin-sidebar';

export default function EmployeesPage() {
    const { data: session } = useSession();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        try {
            const response = await fetch('/api/admin/employees');
            if (response.ok) {
                const data = await response.json();
                setEmployees(data.employees || []);
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredEmployees = employees.filter(emp =>
        emp.name?.toLowerCase().includes(search.toLowerCase()) ||
        emp.employeeId?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="min-h-screen flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8">
                <div className="mb-10">
                    <div className="flex justify-between items-start">
                        <h1 className="text-4xl font-bold text-gray-900 uppercase tracking-tight ">Employee Database</h1>
                        <Link href="/admin/employees/new">
                            <button className="px-10 py-4 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wider border border-gray-200 shadow-sm hover:shadow-none transition-all flex items-center gap-3 active:translate-x-1 active:translate-y-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                </svg>
                                REGISTER_NEW_ENTITY
                            </button>
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-6 mb-8">
                    <div className="relative flex-1 max-w-md">
                        <input
                            type="text"
                            placeholder="SCANNING_REGISTRY_BY_NAME_OR_ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 text-[10px] font-bold outline-none placeholder:text-gray-300 bg-white shadow-sm focus:shadow-none transition-all uppercase tracking-wide "
                        />
                        <svg className="w-5 h-5 text-gray-900 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <div className="bg-primary-600 text-white text-[10px] font-bold px-6 py-3 border border-gray-200 uppercase tracking-wider shadow-sm">
                        TOTAL_ENTITIES: {employees.length}
                    </div>
                </div>

                <div className="border border-gray-200 bg-white shadow-sm overflow-hidden">
                    <table className="w-full text-left text-[10px]">
                        <thead>
                            <tr className="bg-primary-700 text-white">
                                <th className="px-8 py-5 font-bold uppercase tracking-wide border-r border-white/20 ">Identified Entity</th>
                                <th className="px-8 py-5 font-bold uppercase tracking-wide border-r border-white/20">System Id</th>
                                <th className="px-8 py-5 font-bold uppercase tracking-wide border-r border-white/20">Network Email</th>
                                <th className="px-8 py-5 font-bold uppercase tracking-wide border-r border-white/20">Assigned Unit</th>
                                <th className="px-8 py-5 font-bold uppercase tracking-wide border-r border-white/20">Functional Role</th>
                                <th className="px-8 py-5 font-bold uppercase tracking-wide text-center ">Executive Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 ">
                            {loading ? (
                                <tr><td colSpan="6" className="px-8 py-16 text-center text-gray-400 tracking-wider animate-pulse">SYNCHRONIZING_REGISTRY...</td></tr>
                            ) : filteredEmployees.length === 0 ? (
                                <tr><td colSpan="6" className="px-8 py-16 text-center text-gray-400 font-bold uppercase tracking-wide">Zero Entities Detected In Scan</td></tr>
                            ) : (
                                filteredEmployees.map((employee) => (
                                    <tr key={employee.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-8 py-5 border-r border-gray-200 font-bold text-gray-900 bg-gray-50/30">
                                            {employee.name}
                                        </td>
                                        <td className="px-8 py-5 border-r border-gray-200 font-bold text-primary-600">{employee.employeeId || 'UNDEFINED'}</td>
                                        <td className="px-8 py-5 border-r border-gray-200 font-bold text-gray-500">{employee.email}</td>
                                        <td className="px-8 py-5 border-r border-gray-200 font-bold uppercase tracking-wide">{employee.jobDetails?.department || 'UNASSIGNED'}</td>
                                        <td className="px-8 py-5 border-r border-gray-200 font-bold uppercase tracking-wide">{employee.jobDetails?.jobPosition || 'UNDEFINED'}</td>
                                        <td className="px-8 py-5 text-center">
                                            <Link
                                                href={`/admin/employees/${employee.id}`}
                                                className="inline-block px-6 py-2 bg-white border border-gray-200 text-[8px] font-bold uppercase tracking-wider hover:bg-primary-800 hover:text-white transition-all shadow-sm active:shadow-none"
                                            >
                                                ACCESS_PROFILE
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}

