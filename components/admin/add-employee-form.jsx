'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_TEMP_PASSWORD, DEPARTMENTS, LEAVE_QUOTAS, MAX_LEAVE_QUOTA } from '@/lib/constants';
import { missingEmployeeDetails } from '@/lib/employee-required';
import { DetailSections, ExtraField, FormSection, Field, Grid, INPUT, buildDetailsPayload, emptyDetails } from '@/components/profile/details-form';

// The form takes one full name; the API stores first + last name.
function buildPayload(data, details) {
    const { fullName, ...rest } = data;
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    return {
        ...rest,
        firstName,
        lastName,
        phone: rest.phone.trim(),
        personalEmail: rest.personalEmail.trim(),
        details: buildDetailsPayload(details),
        sickLeaveQuota: Number(rest.sickLeaveQuota),
        casualLeaveQuota: Number(rest.casualLeaveQuota),
    };
}

export function AddEmployeeForm() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(null);
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        gender: '',
        maritalStatus: '',
        nationality: '',
        personalEmail: '',
        residingAddress: '',
        jobPosition: '',
        department: '',
        dateOfJoining: '',
        managerId: '',
        managerEmail: '',
        workLocation: '',
        role: 'EMPLOYEE',
        biometricId: '',
        sickLeaveQuota: String(LEAVE_QUOTAS.SICK),
        casualLeaveQuota: String(LEAVE_QUOTAS.CASUAL),
    });
    const [details, setDetails] = useState(emptyDetails);
    const [managers, setManagers] = useState([]);
    const [managersLoaded, setManagersLoaded] = useState(false);

    useEffect(() => {
        fetch('/api/admin/managers')
            .then((res) => res.json())
            .then((data) => setManagers(data.managers || []))
            .catch(() => setManagers([]))
            .finally(() => setManagersLoaded(true));
    }, []);

    const handleManagerChange = (e) => {
        const manager = managers.find((m) => m.id === e.target.value);
        // Selecting a manager fills the compulsory manager email; it can be re-checked before saving
        setFormData((prev) => ({ ...prev, managerId: e.target.value, managerEmail: manager ? manager.email : '' }));
    };

    const validate = () => {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRe = /^[0-9]{10}$/;
        if (formData.fullName.trim().length < 2) return 'Employee name is required';
        if (!phoneRe.test(formData.phone.trim())) return 'Mobile number must be 10 digits';
        if (!formData.residingAddress.trim()) return 'Address is required';
        if (!formData.gender) return 'Please select a gender';
        if (!formData.dateOfBirth) return 'Date of birth is required';
        if (formData.jobPosition.trim().length < 2) return 'Designation is required';
        if (!DEPARTMENTS.includes(formData.department)) return 'Please select a department';
        for (const [key, label] of [['sickLeaveQuota', 'Sick leave'], ['casualLeaveQuota', 'Casual leave']]) {
            const n = Number(formData[key]);
            if (formData[key] === '' || !Number.isInteger(n) || n < 0 || n > MAX_LEAVE_QUOTA) return `${label} must be a whole number from 0 to ${MAX_LEAVE_QUOTA}`;
        }
        if (!formData.dateOfJoining) return 'Date of joining is required';
        if (formData.personalEmail.trim() && !emailRe.test(formData.personalEmail.trim())) return 'Personal e-mail must be a valid email address';
        if (details.alternateMobile.trim() && !phoneRe.test(details.alternateMobile.trim())) return 'Alternate mobile number must be 10 digits';
        if (details.emergencyContactNumber.trim() && !phoneRe.test(details.emergencyContactNumber.trim())) return 'Emergency contact number must be 10 digits';
        if (!emailRe.test(formData.email.trim())) return 'Employee email is required and must be a valid email address';
        if (!formData.managerId) return 'Please select a manager';
        if (!emailRe.test(formData.managerEmail.trim())) return "Manager's email is required and must be a valid email address";
        // Every other detail is compulsory too
        return missingEmployeeDetails({ ...formData, name: formData.fullName }, details);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess(null);

        const problem = validate();
        if (problem) {
            setError(problem);
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/admin/employees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(buildPayload(formData, details)),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create employee');
            }

            setSuccess({ ...result.employee, password: result.employee?.temporaryPassword || DEFAULT_TEMP_PASSWORD });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-2xl mx-auto py-12">
                <div className="bg-white border border-gray-200 shadow-sm p-10 mb-10">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-green-500 border border-gray-200 flex items-center justify-center shadow-sm">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-gray-900 uppercase tracking-tight">Entity Initialized</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Protocol validation successful</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-gray-50 border border-gray-200 p-6 shadow-sm">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 ">Assigned System Id</p>
                            <p className="text-3xl font-bold text-primary-600 ">{success.employeeId}</p>
                        </div>
                        <div className="bg-primary-700 p-6 shadow-sm">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 ">Temporary password (same for everyone)</p>
                            <p className="text-3xl font-bold text-red-500 tracking-wide">{success.password}</p>
                        </div>
                        <div className="border border-gray-200 p-4 bg-yellow-50 ">
                            <p className="text-[10px] text-gray-900 font-bold uppercase tracking-wide leading-loose">
                                <span className="text-red-600">⚠ CRITICAL:</span> Share this temporary password with the person. They must change it on first login.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-6">
                    <button onClick={() => router.push('/admin')} className="flex-1 bg-primary-700 text-white text-[10px] font-bold py-4 border border-gray-200 uppercase tracking-wider hover:bg-white hover:text-gray-900 transition-all shadow-sm active:shadow-none">Return To Base</button>
                    <button onClick={() => window.location.reload()} className="flex-1 bg-white text-gray-900 text-[10px] font-bold py-4 border border-gray-200 uppercase tracking-wider hover:bg-gray-100 transition-all shadow-sm active:shadow-none">Initialize Another</button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-12">
            {error && (
                <div className="p-6 bg-red-600 border border-gray-200 shadow-sm flex items-center gap-4">
                    <div className="w-8 h-8 bg-white flex items-center justify-center font-bold text-red-600">!</div>
                    <p className="text-white text-[10px] font-bold uppercase tracking-wide ">Error: {error}</p>
                </div>
            )}

            {/* General Grid Layout for all sections */}
            <div className="space-y-12 pb-20">
                {/* 1. Personal Details */}
                <FormSection number="1" title="Personal Details (Required)">
                    <Grid>
                        <Field label="Employee Code">
                            <input value="AUTO-GENERATED ON SAVE" disabled className={`${INPUT} bg-gray-50 text-gray-400`} />
                        </Field>
                        <Field label="Employee Name" required>
                            <input name="fullName" value={formData.fullName} onChange={handleChange} required placeholder="First and last name" className={INPUT} />
                        </Field>
                        <Field label="Designation" required>
                            <input name="jobPosition" value={formData.jobPosition} onChange={handleChange} required className={INPUT} />
                        </Field>
                        <Field label="Department" required>
                            <select name="department" value={formData.department} onChange={handleChange} required className={INPUT}>
                                <option value="">Select department</option>
                                {DEPARTMENTS.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </Field>
                        <ExtraField name="divisionSection" details={details} setDetails={setDetails} required />
                        <ExtraField name="employmentStatus" details={details} setDetails={setDetails} required />
                        <ExtraField name="city" details={details} setDetails={setDetails} required />
                        <div className="hidden md:block" />
                        <Field label="Correspondence Address" required className="md:col-span-2">
                            <textarea name="residingAddress" value={formData.residingAddress} onChange={handleChange} required rows={3} className={INPUT} />
                        </Field>
                        <ExtraField name="permanentAddress" details={details} setDetails={setDetails} required />
                        <Field label="Mobile Number" required>
                            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required maxLength={10} placeholder="10 digits" className={INPUT} />
                        </Field>
                        <ExtraField name="alternateMobile" details={details} setDetails={setDetails} required />
                        <Field label="Official Mail ID" required>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} required className={INPUT} />
                        </Field>
                        <Field label="Personal E-mail ID" required>
                            <input type="email" name="personalEmail" value={formData.personalEmail} onChange={handleChange} required className={INPUT} />
                        </Field>
                        <Field label="DOB" required>
                            <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} required className={INPUT} />
                        </Field>
                        <Field label="Gender" required>
                            <select name="gender" value={formData.gender} onChange={handleChange} required className={`${INPUT} uppercase`}>
                                <option value="">Select gender</option>
                                <option value="Male">MALE</option>
                                <option value="Female">FEMALE</option>
                                <option value="Other">OTHER</option>
                            </select>
                        </Field>
                        <Field label="Marital Status" required>
                            <select name="maritalStatus" value={formData.maritalStatus} onChange={handleChange} required className={`${INPUT} uppercase`}>
                                <option value="">Select status</option>
                                <option value="Single">SINGLE</option>
                                <option value="Married">MARRIED</option>
                                <option value="Divorced">DIVORCED</option>
                                <option value="Widowed">WIDOWED</option>
                            </select>
                        </Field>
                        <ExtraField name="bloodGroup" details={details} setDetails={setDetails} required />
                        <Field label="DOJ (use a past date for existing employees)" required>
                            <input type="date" name="dateOfJoining" value={formData.dateOfJoining} onChange={handleChange} required className={INPUT} />
                        </Field>
                        <div className="hidden md:block" />
                        <ExtraField name="emergencyContactName" details={details} setDetails={setDetails} required />
                        <ExtraField name="emergencyContactNumber" details={details} setDetails={setDetails} required />
                        <ExtraField name="emergencyContactRelation" details={details} setDetails={setDetails} required />
                    </Grid>
                </FormSection>

                {/* 2 to 7: Family, PF, Academic, Experience, Bank, Documents */}
                <DetailSections details={details} setDetails={setDetails} mode="create" />

                {/* 8. Reporting line */}
                <FormSection number="8" title="Reporting Manager (Required)">
                    <Grid>
                        <Field label="Manager" required>
                            <select name="managerId" value={formData.managerId} onChange={handleManagerChange} required className={`${INPUT} uppercase`}>
                                <option value="">{managersLoaded ? 'Select manager' : 'LOADING...'}</option>
                                {managers.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name} ({m.role === 'ADMIN' ? 'HR/ADMIN' : m.role === 'TEAM_LEAD' ? 'TEAM LEAD' : 'MANAGER'})
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Manager Email" required>
                            <input type="email" name="managerEmail" value={formData.managerEmail} onChange={handleChange} required placeholder="manager@company.com" className={INPUT} />
                        </Field>
                    </Grid>
                </FormSection>

                {/* Access credentials */}
                <div>
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-2 h-8 bg-gray-400"></div>
                        <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider ">9. Login Details</h3>
                    </div>
                    <p className="mb-4 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                        First password for every new person: <span className="font-mono text-gray-900 normal-case">{DEFAULT_TEMP_PASSWORD}</span> (they must change it at first login)
                    </p>
                    <div className="grid grid-cols-2 gap-x-10 gap-y-8 bg-white border border-gray-200 p-10 shadow-sm">
                        <div className="space-y-2">
                            <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide block ">Biometric Device ID (Optional)</label>
                            <input
                                type="text"
                                name="biometricId"
                                value={formData.biometricId}
                                onChange={handleChange}
                                maxLength={40}
                                placeholder="ID saved on the fingerprint machine"
                                className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide block ">Sick Leave (days per year) <span className="text-red-500">*</span></label>
                            <input
                                type="number"
                                name="sickLeaveQuota"
                                value={formData.sickLeaveQuota}
                                onChange={handleChange}
                                required
                                min={0}
                                max={MAX_LEAVE_QUOTA}
                                step={1}
                                className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide block ">Casual Leave (days per year) <span className="text-red-500">*</span></label>
                            <input
                                type="number"
                                name="casualLeaveQuota"
                                value={formData.casualLeaveQuota}
                                onChange={handleChange}
                                required
                                min={0}
                                max={MAX_LEAVE_QUOTA}
                                step={1}
                                className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide block ">Account Role</label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                            >
                                <option value="EMPLOYEE">EMPLOYEE</option>
                                <option value="TEAM_LEAD">Team Lead (approves first)</option>
                                <option value="MANAGER">Manager (approves after team lead)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary-700 text-white text-xs font-bold py-6 border-b-4 border-r-4 border-primary-600 uppercase tracking-wider hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:translate-x-1 active:translate-y-1 shadow-sm disabled:opacity-50"
                >
                    {loading ? 'Adding employee...' : 'Add Employee'}
                </button>
            </div>
        </form>
    );
}
