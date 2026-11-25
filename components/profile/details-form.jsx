'use client';

import { useState } from 'react';

// Form pieces for the extra employee sections. Used by "Add employee" and "Edit employee".
// The parent keeps one `details` object in state and passes `setDetails`.

export const INPUT =
    'w-full px-4 py-3 border border-gray-200 text-[10px] font-bold outline-none focus:bg-gray-50 transition-all placeholder:text-gray-300 bg-white';
const LABEL = 'text-[8px] font-bold text-gray-400 uppercase tracking-wide block';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const STATUS_OPTIONS = ['Active', 'Inactive', 'On Notice', 'Resigned', 'Terminated'];
export const DOCUMENT_TYPES = [
    'PAN Document',
    'Aadhaar Document',
    'Educational Certificates',
    'Experience Certificates',
    'Bank Proof',
    'Other Supporting Documents',
];

const FAMILY_COLUMNS = [
    { key: 'name', label: 'Family Member Name', required: true },
    { key: 'relationship', label: 'Relationship' },
    { key: 'dob', label: 'DOB', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'] },
    { key: 'occupation', label: 'Occupation' },
    { key: 'contact', label: 'Contact Number', type: 'tel', maxLength: 10, placeholder: '10 digits' },
    { key: 'dependent', label: 'Dependent / Non-Dependent', type: 'select', options: ['Dependent', 'Non-Dependent'] },
    { key: 'nominee', label: 'Nominee', type: 'select', options: ['Yes', 'No'] },
];
const EDUCATION_COLUMNS = [
    { key: 'qualification', label: 'Qualification', required: true },
    { key: 'course', label: 'Course / Degree' },
    { key: 'specialization', label: 'Specialization' },
    { key: 'institution', label: 'Institution / University' },
    { key: 'yearOfPassing', label: 'Year of Passing', maxLength: 4, placeholder: 'YYYY' },
    { key: 'percentage', label: 'Percentage / CGPA' },
    { key: 'additionalQualification', label: 'Additional Qualification' },
    { key: 'certification', label: 'Certification' },
];
const EXPERIENCE_COLUMNS = [
    { key: 'company', label: 'Previous Company', required: true },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'dateOfJoining', label: 'Date of Joining', type: 'date' },
    { key: 'dateOfLeaving', label: 'Date of Leaving', type: 'date' },
    { key: 'totalExperience', label: 'Total Experience', placeholder: 'e.g. 2 years 3 months' },
    { key: 'reasonForLeaving', label: 'Reason for Leaving' },
];

const blankRow = (columns) => Object.fromEntries(columns.map((c) => [c.key, '']));

/** Starting values for a new employee (every field empty). */
export function emptyDetails() {
    return {
        divisionSection: '',
        employmentStatus: 'Active',
        city: '',
        permanentAddress: '',
        alternateMobile: '',
        bloodGroup: '',
        emergencyContactName: '',
        emergencyContactNumber: '',
        emergencyContactRelation: '',
        uanNumber: '',
        pfNumber: '',
        dojInPf: '',
        dol: '',
        rol: '',
        probationStatus: '',
        dateOfConfirmation: '',
        esicNumber: '',
        familyMembers: [],
        education: [],
        experience: [],
        sensitive: {
            cubAccountNumber: '',
            personalBankAccount: '',
            ifscCode: '',
            bankName: '',
            salary: '',
            panNo: '',
            aadhaarNo: '',
        },
        documents: [], // newly uploaded files
        removeDocumentIds: [], // existing documents to delete (edit only)
    };
}

/** Values of an existing employee (from /api/profile/:id) for the edit form. */
export function detailsFromProfile(profile) {
    const base = emptyDetails();
    if (!profile) return base;
    const out = { ...base };
    for (const key of Object.keys(base)) {
        if (['familyMembers', 'education', 'experience', 'sensitive', 'documents', 'removeDocumentIds'].includes(key)) continue;
        out[key] = profile[key] ?? '';
    }
    const rows = (value, columns) =>
        Array.isArray(value) ? value.map((r) => ({ ...blankRow(columns), ...r })) : [];
    out.familyMembers = rows(profile.familyMembers, FAMILY_COLUMNS);
    out.education = rows(profile.education, EDUCATION_COLUMNS);
    out.experience = rows(profile.experience, EXPERIENCE_COLUMNS);
    return out;
}

/** What is sent to the API as `details`. Empty rows are dropped. */
export function buildDetailsPayload(details, { includeSensitive = true } = {}) {
    const { familyMembers, education, experience, sensitive, documents, removeDocumentIds, ...scalars } = details;
    const used = (rows) => rows.filter((r) => Object.values(r).some((v) => String(v || '').trim() !== ''));
    return {
        ...scalars,
        familyMembers: used(familyMembers),
        education: used(education),
        experience: used(experience),
        ...(includeSensitive ? { sensitive } : {}),
        documents,
        removeDocumentIds,
    };
}

export function FormSection({ number, title, hint, children }) {
    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <div className="w-2 h-8 bg-primary-700"></div>
                <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider">
                    {number ? `${number}. ` : ''}
                    {title}
                    {hint ? <span className="ml-2 text-gray-400 normal-case font-semibold">{hint}</span> : null}
                </h3>
            </div>
            <div className="bg-white border border-gray-200 p-10 shadow-sm space-y-8">{children}</div>
        </div>
    );
}

export function Field({ label, required, className = '', children }) {
    return (
        <div className={`space-y-2 ${className}`}>
            <label className={LABEL}>
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            {children}
        </div>
    );
}

export function Grid({ children }) {
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">{children}</div>;
}

function Control({ column, value, onChange }) {
    if (column.type === 'select') {
        return (
            <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${INPUT} uppercase`}>
                <option value="">Select</option>
                {column.options.map((o) => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
            </select>
        );
    }
    return (
        <input
            type={column.type || 'text'}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            maxLength={column.maxLength}
            placeholder={column.placeholder}
            className={INPUT}
        />
    );
}

function RowsEditor({ rows, columns, onChange, addLabel, itemLabel }) {
    const update = (index, key, value) => onChange(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
    return (
        <div className="space-y-6">
            {rows.length === 0 && <p className="text-[10px] font-bold text-gray-400 uppercase">No {itemLabel.toLowerCase()} added yet</p>}
            {rows.map((row, index) => (
                <div key={index} className="border border-gray-200 p-6 space-y-6 bg-gray-50/40">
                    <div className="flex items-center justify-between">
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">
                            {itemLabel} {index + 1}
                        </p>
                        <button
                            type="button"
                            onClick={() => onChange(rows.filter((_, i) => i !== index))}
                            className="text-[9px] font-bold uppercase text-red-600 border border-red-200 px-3 py-1 hover:bg-red-50"
                        >
                            Remove
                        </button>
                    </div>
                    <Grid>
                        {columns.map((column) => (
                            <Field key={column.key} label={column.label} required={column.required}>
                                <Control column={column} value={row[column.key]} onChange={(v) => update(index, column.key, v)} />
                            </Field>
                        ))}
                    </Grid>
                </div>
            ))}
            <button
                type="button"
                onClick={() => onChange([...rows, blankRow(columns)])}
                className="px-5 py-3 border border-gray-200 text-[9px] font-bold uppercase tracking-wide hover:bg-primary-800 hover:text-white transition-all"
            >
                + {addLabel}
            </button>
        </div>
    );
}

const EXTRA_FIELDS = {
    divisionSection: { label: 'Division / Section', maxLength: 100 },
    employmentStatus: { label: 'Status', type: 'select', options: STATUS_OPTIONS },
    city: { label: 'City', maxLength: 100 },
    permanentAddress: { label: 'Permanent Address', type: 'textarea', maxLength: 500, wide: true },
    alternateMobile: { label: 'Alternate Mobile Number', type: 'tel', maxLength: 10, placeholder: '10 digits' },
    bloodGroup: { label: 'Blood Group', type: 'select', options: BLOOD_GROUPS },
    emergencyContactName: { label: 'Emergency Contact Name', maxLength: 100 },
    emergencyContactNumber: { label: 'Emergency Contact Number', type: 'tel', maxLength: 10, placeholder: '10 digits' },
    emergencyContactRelation: { label: 'Emergency Contact Relation', maxLength: 50 },
};

/** One of the extra section 1 fields (division, status, city, permanent address, alternate mobile, blood group, emergency contact). */
export function ExtraField({ name, details, setDetails }) {
    const config = EXTRA_FIELDS[name];
    const onChange = (e) => setDetails((d) => ({ ...d, [name]: e.target.value }));
    return (
        <Field label={config.label} className={config.wide ? 'md:col-span-2' : ''}>
            {config.type === 'select' ? (
                <select value={details[name]} onChange={onChange} className={`${INPUT} uppercase`}>
                    <option value="">Select</option>
                    {config.options.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </select>
            ) : config.type === 'textarea' ? (
                <textarea value={details[name]} onChange={onChange} rows={3} maxLength={config.maxLength} className={INPUT} />
            ) : (
                <input type={config.type || 'text'} value={details[name]} onChange={onChange} maxLength={config.maxLength} placeholder={config.placeholder} className={INPUT} />
            )}
        </Field>
    );
}

function DocumentsEditor({ details, setDetails, existingDocuments }) {
    const [type, setType] = useState(DOCUMENT_TYPES[0]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const upload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setUploading(true);
        setError('');
        try {
            const body = new FormData();
            body.append('file', file);
            body.append('type', 'document');
            const res = await fetch('/api/upload', { method: 'POST', body });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            setDetails((d) => ({ ...d, documents: [...d.documents, { documentType: type, fileName: file.name.slice(0, 200), fileUrl: data.url }] }));
        } catch (err) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const removed = new Set(details.removeDocumentIds);
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 items-end">
                <Field label="Document Type">
                    <select value={type} onChange={(e) => setType(e.target.value)} className={`${INPUT} uppercase`}>
                        {DOCUMENT_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label={uploading ? 'Uploading...' : 'Choose File (PDF / PNG / JPG, max 5 MB)'}>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif" onChange={upload} disabled={uploading} className={INPUT} />
                </Field>
            </div>
            {error && <p className="text-[10px] font-bold text-red-600 uppercase">{error}</p>}

            {(existingDocuments?.length > 0 || details.documents.length > 0) && (
                <div className="flex flex-col gap-3">
                    {existingDocuments?.map((doc) => (
                        <div key={doc.id} className={`flex justify-between items-center border border-gray-200 px-4 py-3 text-xs font-bold ${removed.has(doc.id) ? 'opacity-40 line-through' : ''}`}>
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {doc.fileName}
                            </a>
                            <span className="flex items-center gap-4">
                                <span className="text-[8px] text-gray-400 uppercase">{doc.documentType || doc.fileType}</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setDetails((d) => ({
                                            ...d,
                                            removeDocumentIds: removed.has(doc.id) ? d.removeDocumentIds.filter((x) => x !== doc.id) : [...d.removeDocumentIds, doc.id],
                                        }))
                                    }
                                    className="text-[9px] font-bold uppercase text-red-600"
                                >
                                    {removed.has(doc.id) ? 'Undo' : 'Remove'}
                                </button>
                            </span>
                        </div>
                    ))}
                    {details.documents.map((doc, index) => (
                        <div key={doc.fileUrl} className="flex justify-between items-center border border-green-200 bg-green-50/40 px-4 py-3 text-xs font-bold">
                            <span>{doc.fileName}</span>
                            <span className="flex items-center gap-4">
                                <span className="text-[8px] text-gray-500 uppercase">{doc.documentType} · NEW</span>
                                <button
                                    type="button"
                                    onClick={() => setDetails((d) => ({ ...d, documents: d.documents.filter((_, i) => i !== index) }))}
                                    className="text-[9px] font-bold uppercase text-red-600"
                                >
                                    Remove
                                </button>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Sections 2 to 7.
 *  - mode "create": confidential inputs are always open.
 *  - mode "edit": confidential values stay hidden until HR presses the unlock button (onUnlock loads them).
 */
export function DetailSections({ details, setDetails, existingDocuments = [], mode = 'create', unlocked = true, unlocking = false, unlockError = '', onUnlock }) {
    const set = (key) => (value) => setDetails((d) => ({ ...d, [key]: value }));
    const setSensitive = (key) => (e) => setDetails((d) => ({ ...d, sensitive: { ...d.sensitive, [key]: e.target.value } }));
    const locked = mode === 'edit' && !unlocked;

    const lockedBox = (
        <div className="border border-gray-200 bg-gray-50 p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
                <p className="text-[10px] font-bold text-gray-900 uppercase">XXXX XXXX XXXX</p>
                <p className="text-[9px] font-bold text-gray-400 uppercase mt-1">Confidential values are hidden. Unlock to view and edit them.</p>
                {unlockError && <p className="text-[9px] font-bold text-red-600 uppercase mt-2">{unlockError}</p>}
            </div>
            <button
                type="button"
                onClick={onUnlock}
                disabled={unlocking}
                className="px-5 py-3 bg-primary-700 text-white text-[9px] font-bold uppercase tracking-wide disabled:opacity-50"
            >
                {unlocking ? 'Unlocking...' : 'Unlock & Edit'}
            </button>
        </div>
    );

    return (
        <>
            <FormSection number="2" title="Family Details">
                <RowsEditor rows={details.familyMembers} columns={FAMILY_COLUMNS} onChange={set('familyMembers')} addLabel="Add family member" itemLabel="Family member" />
            </FormSection>

            <FormSection number="3" title="PF Details">
                <Grid>
                    <Field label="UAN Number">
                        <input value={details.uanNumber} onChange={(e) => set('uanNumber')(e.target.value)} maxLength={12} placeholder="12 digits" className={INPUT} />
                    </Field>
                    <Field label="PF Number">
                        <input value={details.pfNumber} onChange={(e) => set('pfNumber')(e.target.value)} maxLength={40} className={INPUT} />
                    </Field>
                    <Field label="DOJ in PF">
                        <input type="date" value={details.dojInPf} onChange={(e) => set('dojInPf')(e.target.value)} className={INPUT} />
                    </Field>
                    <Field label="DOL (Date of Leaving)">
                        <input type="date" value={details.dol} onChange={(e) => set('dol')(e.target.value)} className={INPUT} />
                    </Field>
                    <Field label="ROL (Reason of Leaving)">
                        <input value={details.rol} onChange={(e) => set('rol')(e.target.value)} maxLength={200} className={INPUT} />
                    </Field>
                    <Field label="Probation / Confirmation">
                        <select value={details.probationStatus} onChange={(e) => set('probationStatus')(e.target.value)} className={`${INPUT} uppercase`}>
                            <option value="">Select</option>
                            <option value="Probation">PROBATION</option>
                            <option value="Confirmed">CONFIRMED</option>
                        </select>
                    </Field>
                    <Field label="Date of Confirmation">
                        <input type="date" value={details.dateOfConfirmation} onChange={(e) => set('dateOfConfirmation')(e.target.value)} className={INPUT} />
                    </Field>
                    <Field label="ESIC Number">
                        <input value={details.esicNumber} onChange={(e) => set('esicNumber')(e.target.value)} maxLength={20} className={INPUT} />
                    </Field>
                </Grid>
            </FormSection>

            <FormSection number="4" title="Academic Details">
                <RowsEditor rows={details.education} columns={EDUCATION_COLUMNS} onChange={set('education')} addLabel="Add qualification" itemLabel="Qualification" />
            </FormSection>

            <FormSection number="5" title="Experience Details">
                <RowsEditor rows={details.experience} columns={EXPERIENCE_COLUMNS} onChange={set('experience')} addLabel="Add experience" itemLabel="Experience" />
            </FormSection>

            <FormSection number="6" title="Bank Details" hint="(confidential: shown hidden on the profile)">
                {locked ? (
                    lockedBox
                ) : (
                    <Grid>
                        <Field label="CUB Account Number">
                            <input value={details.sensitive.cubAccountNumber} onChange={setSensitive('cubAccountNumber')} autoComplete="off" maxLength={18} placeholder="9 to 18 digits" className={INPUT} />
                        </Field>
                        <Field label="Personal Bank Account">
                            <input value={details.sensitive.personalBankAccount} onChange={setSensitive('personalBankAccount')} autoComplete="off" maxLength={18} placeholder="9 to 18 digits" className={INPUT} />
                        </Field>
                        <Field label="IFSC Code">
                            <input value={details.sensitive.ifscCode} onChange={setSensitive('ifscCode')} autoComplete="off" maxLength={11} placeholder="e.g. CIUB0000123" className={`${INPUT} uppercase`} />
                        </Field>
                        <Field label="Bank Name">
                            <input value={details.sensitive.bankName} onChange={setSensitive('bankName')} autoComplete="off" maxLength={100} className={INPUT} />
                        </Field>
                        <Field label="Salary">
                            <input value={details.sensitive.salary} onChange={setSensitive('salary')} autoComplete="off" inputMode="decimal" placeholder="Amount" className={INPUT} />
                        </Field>
                    </Grid>
                )}
            </FormSection>

            <FormSection number="7" title="Documents" hint="(PAN and Aadhaar numbers are confidential)">
                {locked ? (
                    lockedBox
                ) : (
                    <Grid>
                        <Field label="PAN No">
                            <input value={details.sensitive.panNo} onChange={setSensitive('panNo')} autoComplete="off" maxLength={10} placeholder="ABCDE1234F" className={`${INPUT} uppercase`} />
                        </Field>
                        <Field label="Aadhaar No">
                            <input value={details.sensitive.aadhaarNo} onChange={setSensitive('aadhaarNo')} autoComplete="off" maxLength={14} placeholder="12 digits" className={INPUT} />
                        </Field>
                    </Grid>
                )}
                <DocumentsEditor details={details} setDetails={setDetails} existingDocuments={existingDocuments} />
            </FormSection>
        </>
    );
}
