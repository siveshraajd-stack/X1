'use client';

import { useEffect, useRef, useState } from 'react';

// Read-only view of the 7 employee sections. Used on every profile page.
// Confidential values (bank, IFSC, salary, PAN, Aadhaar) are shown as XXXX XXXX until the
// person who is allowed to (HR, or the employee) presses SHOW. They are fetched only then.

const MASK = 'XXXX XXXX';
const AUTO_HIDE_MS = 60_000;

const fmtDate = (value) => {
    if (!value) return '';
    const text = String(value);
    // Plain YYYY-MM-DD text: show it as that exact day (no timezone shift)
    const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00+05:30`) : new Date(value);
    if (Number.isNaN(d.getTime())) return text;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

function Card({ number, title, children }) {
    return (
        <section className="border border-gray-200 bg-white shadow-sm rounded-2xl p-8">
            <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider mb-6 underline">
                {number}. {title}
            </h3>
            {children}
        </section>
    );
}

function Item({ label, value, wide = false }) {
    return (
        <div className={`${wide ? 'md:col-span-3' : ''} border-l-2 border-gray-200 pl-4 min-w-0`}>
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xs font-bold text-gray-900 break-words whitespace-pre-line">{value || 'Not provided'}</p>
        </div>
    );
}

function Grid({ children }) {
    return <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">{children}</div>;
}

function Table({ columns, rows, empty }) {
    if (!rows?.length) return <p className="text-xs font-bold text-gray-500">{empty}</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
                <thead>
                    <tr className="border-b border-gray-200">
                        {columns.map((c) => (
                            <th key={c.key} className="py-2 pr-6 text-[8px] font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                            {columns.map((c) => (
                                <td key={c.key} className="py-3 pr-6 font-bold text-gray-900 align-top">
                                    {(c.format ? c.format(row[c.key]) : row[c.key]) || '-'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function EmployeeSections({ employee }) {
    const profile = employee.profile || {};
    const job = employee.jobDetails || {};
    const sensitive = employee.sensitive || { present: {}, canReveal: false };

    // ---- confidential values: hidden until SHOW is pressed ----
    const [values, setValues] = useState(null);
    const [shown, setShown] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const timer = useRef(null);

    // Hide everything again after a minute (and when the page is left)
    useEffect(() => {
        clearTimeout(timer.current);
        if (Object.values(shown).some(Boolean)) {
            timer.current = setTimeout(() => {
                setShown({});
                setValues(null);
            }, AUTO_HIDE_MS);
        }
        return () => clearTimeout(timer.current);
    }, [shown]);

    const toggle = async (key) => {
        setError('');
        if (shown[key]) {
            setShown((s) => ({ ...s, [key]: false }));
            return;
        }
        if (!values) {
            setBusy(true);
            try {
                const res = await fetch(`/api/profile/${employee.id}/sensitive`, { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Could not load the details');
                setValues(data.values);
            } catch (err) {
                setError(err.message);
                setBusy(false);
                return;
            }
            setBusy(false);
        }
        setShown((s) => ({ ...s, [key]: true }));
    };

    const Secret = ({ label, field, format }) => {
        const present = sensitive.present?.[field];
        const visible = shown[field] && values;
        let display = 'Not provided';
        if (present) display = visible ? (format ? format(values[field]) : values[field]) || 'Not provided' : MASK;
        return (
            <div className="border-l-2 border-gray-200 pl-4 min-w-0">
                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <div className="flex items-center gap-3">
                    <p className={`text-xs font-bold break-all ${present && !visible ? 'text-gray-500 tracking-widest' : 'text-gray-900'}`}>{display}</p>
                    {present && sensitive.canReveal && (
                        <button
                            type="button"
                            onClick={() => toggle(field)}
                            disabled={busy}
                            className="text-[8px] font-bold uppercase tracking-wide border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50 shrink-0"
                        >
                            {visible ? 'Hide' : busy ? '...' : 'Show'}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const money = (v) => (v && !Number.isNaN(Number(v)) ? `₹ ${Number(v).toLocaleString('en-IN')}` : v);

    const documents = employee.documents || [];

    return (
        <div className="space-y-8">
            <Card number="1" title="Personal Details">
                <Grid>
                    <Item label="Employee Code" value={employee.employeeId} />
                    <Item label="Employee Name" value={employee.name} />
                    <Item label="Designation" value={job.jobPosition} />
                    <Item label="Department" value={job.department} />
                    <Item label="Division / Section" value={profile.divisionSection} />
                    <Item label="Status" value={profile.employmentStatus} />
                    <Item label="City" value={profile.city} />
                    <Item label="Correspondence Address" value={profile.residingAddress} wide />
                    <Item label="Permanent Address" value={profile.permanentAddress} wide />
                    <Item label="Mobile Number" value={employee.phone} />
                    <Item label="Alternate Mobile Number" value={profile.alternateMobile} />
                    <Item label="Official Mail ID" value={employee.email} />
                    <Item label="Personal E-mail ID" value={profile.personalEmail} />
                    <Item label="DOB" value={fmtDate(profile.dateOfBirth)} />
                    <Item label="Gender" value={profile.gender} />
                    <Item label="Marital Status" value={profile.maritalStatus} />
                    <Item label="Blood Group" value={profile.bloodGroup} />
                    <Item label="DOJ" value={fmtDate(job.dateOfJoining)} />
                    <Item label="Emergency Contact Name" value={profile.emergencyContactName} />
                    <Item label="Emergency Contact Number" value={profile.emergencyContactNumber} />
                    <Item label="Emergency Contact Relation" value={profile.emergencyContactRelation} />
                </Grid>
            </Card>

            <Card number="2" title="Family Details">
                <Table
                    rows={profile.familyMembers}
                    empty="No family details added"
                    columns={[
                        { key: 'name', label: 'Family Member Name' },
                        { key: 'relationship', label: 'Relationship' },
                        { key: 'dob', label: 'DOB', format: fmtDate },
                        { key: 'gender', label: 'Gender' },
                        { key: 'occupation', label: 'Occupation' },
                        { key: 'contact', label: 'Contact Number' },
                        { key: 'dependent', label: 'Dependent / Non-Dependent' },
                        { key: 'nominee', label: 'Nominee' },
                    ]}
                />
            </Card>

            <Card number="3" title="PF Details">
                <Grid>
                    <Item label="UAN Number" value={profile.uanNumber} />
                    <Item label="PF Number" value={profile.pfNumber} />
                    <Item label="DOJ in PF" value={fmtDate(profile.dojInPf)} />
                    <Item label="DOL" value={fmtDate(profile.dol)} />
                    <Item label="ROL" value={profile.rol} />
                    <Item label="Probation / Confirmation" value={profile.probationStatus} />
                    <Item label="Date of Confirmation" value={fmtDate(profile.dateOfConfirmation)} />
                    <Item label="ESIC Number" value={profile.esicNumber} />
                </Grid>
            </Card>

            <Card number="4" title="Academic Details">
                <Table
                    rows={profile.education}
                    empty="No academic details added"
                    columns={[
                        { key: 'qualification', label: 'Qualification' },
                        { key: 'course', label: 'Course / Degree' },
                        { key: 'specialization', label: 'Specialization' },
                        { key: 'institution', label: 'Institution / University' },
                        { key: 'yearOfPassing', label: 'Year of Passing' },
                        { key: 'percentage', label: 'Percentage / CGPA' },
                        { key: 'additionalQualification', label: 'Additional Qualification' },
                        { key: 'certification', label: 'Certification' },
                    ]}
                />
            </Card>

            <Card number="5" title="Experience Details">
                <Table
                    rows={profile.experience}
                    empty="No previous experience added"
                    columns={[
                        { key: 'company', label: 'Previous Company' },
                        { key: 'designation', label: 'Designation' },
                        { key: 'department', label: 'Department' },
                        { key: 'dateOfJoining', label: 'Date of Joining', format: fmtDate },
                        { key: 'dateOfLeaving', label: 'Date of Leaving', format: fmtDate },
                        { key: 'totalExperience', label: 'Total Experience' },
                        { key: 'reasonForLeaving', label: 'Reason for Leaving' },
                    ]}
                />
            </Card>

            <Card number="6" title="Bank Details">
                <Grid>
                    <Secret label="CUB Account Number" field="cubAccountNumber" />
                    <Secret label="Personal Bank Account" field="personalBankAccount" />
                    <Secret label="IFSC Code" field="ifscCode" />
                    <Secret label="Bank Name" field="bankName" />
                    <Secret label="Salary" field="salary" format={money} />
                </Grid>
                {error && <p className="text-[10px] font-bold text-red-600 uppercase mt-4">{error}</p>}
            </Card>

            <Card number="7" title="Documents">
                <Grid>
                    <Secret label="PAN No" field="panNo" />
                    <Secret label="Aadhaar No" field="aadhaarNo" />
                </Grid>
                <div className="mt-8">
                    {documents.length ? (
                        <div className="flex flex-col gap-3">
                            {documents.map((doc) => (
                                <a
                                    key={doc.id}
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex justify-between items-center border border-gray-200 px-4 py-3 text-xs font-bold text-gray-900 hover:bg-gray-50"
                                >
                                    <span className="break-all">{doc.fileName}</span>
                                    <span className="text-[8px] text-gray-400 uppercase shrink-0 ml-4">{doc.documentType || doc.fileType}</span>
                                </a>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs font-bold text-gray-500">No documents uploaded</p>
                    )}
                </div>
            </Card>
        </div>
    );
}
