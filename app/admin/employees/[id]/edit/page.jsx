'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { DetailSections, ExtraField, Field as DField, Grid as DGrid, FormSection, INPUT as DINPUT, buildDetailsPayload, detailsFromProfile, emptyDetails } from '@/components/profile/details-form';

export default function EditEmployeeProfilePage() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [profile, setProfile] = useState(null);
    // Extra sections (family, PF, academic, experience, bank, documents)
    const [details, setDetails] = useState(emptyDetails);
    const [unlocked, setUnlocked] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [unlockError, setUnlockError] = useState('');

    const {
        register,
        handleSubmit,
        formState: { errors, isDirty },
        setValue,
    } = useForm();

    useEffect(() => {
        if (params.id) {
            fetchProfile();
        }
    }, [params.id]);

    const fetchProfile = async () => {
        try {
            const response = await fetch(`/api/profile/${params.id}`);
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                setDetails(detailsFromProfile(data.profile));

                // Set form values
                if (data.user) {
                    setValue('name', data.user.name || '');
                    setValue('phone', data.user.phone || '');
                    setValue('email', data.user.email || '');
                    setValue('employeeId', data.user.employeeId || '');
                    setValue('role', data.user.role || 'EMPLOYEE');
                    setValue('sickLeaveQuota', data.user.sickLeaveQuota ?? 8);
                    setValue('casualLeaveQuota', data.user.casualLeaveQuota ?? 8);
                }
                if (data.profile) {
                    setValue('dateOfBirth', data.profile.dateOfBirth ? new Date(data.profile.dateOfBirth).toISOString().split('T')[0] : '');
                    setValue('gender', data.profile.gender || '');
                    setValue('maritalStatus', data.profile.maritalStatus || '');
                    setValue('nationality', data.profile.nationality || '');
                    setValue('personalEmail', data.profile.personalEmail || '');
                    setValue('residingAddress', data.profile.residingAddress || '');
                    setValue('parentName', data.profile.parentName || '');
                    setValue('parentPhone', data.profile.parentPhone || '');
                    setValue('about', data.profile.about || '');
                    setValue('jobLoves', data.profile.jobLoves || '');
                    setValue('interestsHobbies', data.profile.interestsHobbies || '');
                }
                setValue('managerId', data.user?.managerId || '');
                setValue('biometricId', data.user?.biometricId || '');
                if (data.jobDetails) {
                    setValue('jobPosition', data.jobDetails.jobPosition || '');
                    setValue('department', data.jobDetails.department || '');
                    setValue('workLocation', data.jobDetails.workLocation || '');
                    setValue('dateOfJoining', data.jobDetails.dateOfJoining ? new Date(data.jobDetails.dateOfJoining).toISOString().split('T')[0] : '');
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const [managers, setManagers] = useState([]);
    useEffect(() => {
        fetch('/api/admin/managers')
            .then((res) => res.json())
            .then((d) => setManagers(d.managers || []))
            .catch(() => setManagers([]));
    }, []);

    // Confidential values are loaded only when HR presses Unlock
    const unlockConfidential = async () => {
        setUnlocking(true);
        setUnlockError('');
        try {
            const res = await fetch(`/api/profile/${params.id}/sensitive`, { cache: 'no-store' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Could not load the confidential details');
            setDetails((d) => ({ ...d, sensitive: { ...d.sensitive, ...result.values } }));
            setUnlocked(true);
        } catch (err) {
            setUnlockError(err.message);
        } finally {
            setUnlocking(false);
        }
    };

    const onSubmit = async (data) => {
        setSaving(true);
        setError('');

        try {
            const { managerId, biometricId, email, employeeId, role, sickLeaveQuota, casualLeaveQuota, ...profileData } = data;
            const response = await fetch(`/api/profile/${params.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...profileData, details: buildDetailsPayload(details, { includeSensitive: unlocked }) }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to update profile');
            }

            // Login details, role and reporting line (manager id + compulsory manager email)
            const isHrAccount = profile?.user?.role === 'ADMIN';
            const manager = managers.find((m) => m.id === managerId);
            // HR accounts have no reporting manager; everyone else must have one
            if (!manager && !isHrAccount) throw new Error('Please select a manager');
            const managerResponse = await fetch(`/api/admin/employees/${params.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(manager ? { managerId: manager.id, managerEmail: manager.email } : {}),
                    biometricId: (biometricId || '').trim(),
                    email: (email || '').trim(),
                    ...(isHrAccount
                        ? {}
                        : {
                              employeeId: (employeeId || '').trim(),
                              role,
                              sickLeaveQuota: Number(sickLeaveQuota),
                              casualLeaveQuota: Number(casualLeaveQuota),
                          }),
                }),
            });
            const managerResult = await managerResponse.json();
            if (!managerResponse.ok) throw new Error(managerResult.error || 'Failed to update manager');

            router.push(`/admin/employees/${params.id}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block w-12 h-12 border border-gray-200 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 text-gray-600 font-bold uppercase tracking-wide">LOADING_PROFILE_DATA...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-8">
                <div className="mb-10">
                    <Link
                        href={`/admin/employees/${params.id}`}
                        className="text-[10px] font-bold uppercase tracking-wide border border-gray-200 px-6 py-2 shadow-sm hover:shadow-none transition-all mb-8 inline-flex items-center gap-3 bg-white"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        [ RETURN_TO_ENTITY_PROFILE ]
                    </Link>
                    <h1 className="text-4xl font-bold text-gray-900 uppercase tracking-tight ">Edit Employee Data</h1>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    {error && (
                        <div className="p-6 border border-gray-200 bg-red-50 shadow-sm">
                            <p className="text-red-800 text-[10px] font-bold uppercase tracking-wide ">{error}</p>
                        </div>
                    )}

                    {/* Basic Information */}
                    <div className="border border-gray-200 bg-white shadow-sm p-8">
                        <h3 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-wider border-b-2 border-gray-200 pb-4">Biographical Data Section</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Full Designation <span className="text-red-500">*</span></label>
                                <input
                                    {...register('name', {
                                        required: 'Name is required',
                                    })}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                                />
                                {errors.name && <p className="text-red-600 text-[8px] mt-1">{errors.name.message}</p>}
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Communication Number</label>
                                <input
                                    {...register('phone', {
                                        pattern: {
                                            value: /^[0-9]{10}$/,
                                            message: 'Phone must be 10 digits',
                                        },
                                    })}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                                />
                                {errors.phone && <p className="text-red-600 text-[8px] mt-1">{errors.phone.message}</p>}
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Login Email <span className="text-red-500">*</span></label>
                                <input {...register('email', { required: 'Email is required' })} type="email" className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all " />
                                {errors.email && <p className="text-red-600 text-[8px] mt-1">{errors.email.message}</p>}
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Personal E-mail ID</label>
                                <input {...register('personalEmail')} type="email" className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Employee ID</label>
                                <input {...register('employeeId')} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Role</label>
                                <select {...register('role')} disabled={profile?.user?.role === 'ADMIN'} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all bg-white">
                                    <option value="EMPLOYEE">EMPLOYEE</option>
                                    <option value="TEAM_LEAD">TEAM LEAD</option>
                                    <option value="MANAGER">MANAGER</option>
                                    {profile?.user?.role === 'ADMIN' && <option value="ADMIN">HR / ADMIN</option>}
                                </select>
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Parent / Guardian Name</label>
                                <input {...register('parentName')} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Parent / Guardian Phone</label>
                                <input {...register('parentPhone', { pattern: { value: /^[0-9]{10}$/, message: 'Phone must be 10 digits' } })} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                                {errors.parentPhone && <p className="text-red-600 text-[8px] mt-1">{errors.parentPhone.message}</p>}
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Chronological Birth Date</label>
                                <input {...register('dateOfBirth')} type="date" className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Gender Classification</label>
                                <select
                                    {...register('gender')}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all bg-white"
                                >
                                    <option value="">Select Classification</option>
                                    <option value="Male">MALE</option>
                                    <option value="Female">FEMALE</option>
                                    <option value="Other">OTHER</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Marital Status</label>
                                <select
                                    {...register('maritalStatus')}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all bg-white"
                                >
                                    <option value="">Select Status</option>
                                    <option value="Single">SINGLE</option>
                                    <option value="Married">MARRIED</option>
                                    <option value="Divorced">DIVORCED</option>
                                    <option value="Widowed">WIDOWED</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Nationality Origin</label>
                                <input {...register('nationality')} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Residence Location</label>
                                <textarea
                                    {...register('residingAddress')}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                                />
                            </div>
                        </div>
                    </div>

                    {/* Job Details */}
                    <div className="border border-gray-200 bg-white shadow-sm p-8">
                        <h3 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-wider border-b-2 border-gray-200 pb-4">Professional Assignment Data</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Functional Position</label>
                                <input {...register('jobPosition')} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Departmental Unit</label>
                                <input {...register('department')} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">SUPERVISOR_ENTITY (MANAGER) {profile?.user?.role !== 'ADMIN' && <span className="text-red-500">*</span>}</label>
                                <select
                                    {...register('managerId', { required: profile?.user?.role === 'ADMIN' ? false : 'Manager is required' })}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                                >
                                    <option value="">SELECT MANAGER</option>
                                    {managers.filter((m) => m.id !== params.id).map((m) => (
                                        <option key={m.id} value={m.id}>{m.name} ({m.role === 'ADMIN' ? 'HR/ADMIN' : m.role === 'TEAM_LEAD' ? 'TEAM LEAD' : 'MANAGER'})</option>
                                    ))}
                                </select>
                                {errors.managerId && <p className="text-red-600 text-[8px] mt-1">{errors.managerId.message}</p>}
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Biometric Device User Id</label>
                                <input {...register('biometricId')} maxLength={40} placeholder="ID ON THE FINGERPRINT MACHINE" className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all placeholder:text-gray-300" />
                            </div>
                            {profile?.user?.role !== 'ADMIN' && (
                                <>
                                    <div>
                                        <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Sick Leave (days per year)</label>
                                        <input
                                            {...register('sickLeaveQuota', { required: 'Sick leave is required', min: { value: 0, message: 'Cannot be negative' }, max: { value: 60, message: 'Maximum is 60' }, validate: (v) => Number.isInteger(Number(v)) || 'Use a whole number' })}
                                            type="number"
                                            min={0}
                                            max={60}
                                            step={1}
                                            className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all"
                                        />
                                        {errors.sickLeaveQuota && <p className="text-red-600 text-[8px] mt-1">{errors.sickLeaveQuota.message}</p>}
                                    </div>
                                    <div>
                                        <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Casual Leave (days per year)</label>
                                        <input
                                            {...register('casualLeaveQuota', { required: 'Casual leave is required', min: { value: 0, message: 'Cannot be negative' }, max: { value: 60, message: 'Maximum is 60' }, validate: (v) => Number.isInteger(Number(v)) || 'Use a whole number' })}
                                            type="number"
                                            min={0}
                                            max={60}
                                            step={1}
                                            className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all"
                                        />
                                        {errors.casualLeaveQuota && <p className="text-red-600 text-[8px] mt-1">{errors.casualLeaveQuota.message}</p>}
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Date of Joining</label>
                                <input {...register('dateOfJoining')} type="date" className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Work Location Node</label>
                                <input {...register('workLocation')} className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all " />
                            </div>
                        </div>
                    </div>

                    {/* More personal details (division, status, city, permanent address, blood group, emergency contact, alternate mobile) */}
                    <FormSection title="Additional Personal Details">
                        <DGrid>
                            <ExtraField name="divisionSection" details={details} setDetails={setDetails} />
                            <ExtraField name="employmentStatus" details={details} setDetails={setDetails} />
                            <ExtraField name="city" details={details} setDetails={setDetails} />
                            <ExtraField name="alternateMobile" details={details} setDetails={setDetails} />
                            <ExtraField name="permanentAddress" details={details} setDetails={setDetails} />
                            <ExtraField name="bloodGroup" details={details} setDetails={setDetails} />
                            <div className="hidden md:block" />
                            <ExtraField name="emergencyContactName" details={details} setDetails={setDetails} />
                            <ExtraField name="emergencyContactNumber" details={details} setDetails={setDetails} />
                            <ExtraField name="emergencyContactRelation" details={details} setDetails={setDetails} />
                        </DGrid>
                    </FormSection>

                    {/* Family, PF, Academic, Experience, Bank (hidden until unlocked), PAN / Aadhaar, Documents */}
                    <DetailSections
                        details={details}
                        setDetails={setDetails}
                        existingDocuments={profile?.documents || []}
                        mode="edit"
                        unlocked={unlocked}
                        unlocking={unlocking}
                        unlockError={unlockError}
                        onUnlock={unlockConfidential}
                    />

                    {/* About Section */}
                    <div className="border border-gray-200 bg-white shadow-sm p-8">
                        <h3 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-wider border-b-2 border-gray-200 pb-4">Narrative Information</h3>
                        <div className="space-y-6">
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Personal Synopsis</label>
                                <textarea
                                    {...register('about')}
                                    rows={4}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                                    placeholder="ENTER_BIOGRAPHICAL_SYNTHESIS..."
                                />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Professional Affinity</label>
                                <textarea
                                    {...register('jobLoves')}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                                    placeholder="ENTER_JOB_PREFERENCES..."
                                />
                            </div>
                            <div>
                                <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Recreational Interests</label>
                                <textarea
                                    {...register('interestsHobbies')}
                                    rows={3}
                                    className="w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all "
                                    placeholder="ENTER_HOBBY_DATA..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-6">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-10 py-4 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wider border border-gray-200 shadow-sm hover:shadow-none transition-all disabled:opacity-50 active:translate-x-1 active:translate-y-1"
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (isDirty && !window.confirm('Discard your changes?')) return;
                                router.back();
                            }}
                            className="flex-1 px-10 py-4 bg-white text-gray-900 text-[10px] font-bold uppercase tracking-wider border border-gray-200 shadow-sm hover:shadow-none transition-all active:translate-x-1 active:translate-y-1"
                        >
                            Discard
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
}

