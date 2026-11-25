'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/ui/page-shell';
import { ExpenseTable } from '@/components/expense/expense-table';
import { EXPENSE_CATEGORIES, TRAVEL_MODES } from '@/lib/constants';
import { dayKey } from '@/lib/dates';

const empty = {
    category: '',
    travelMode: '',
    travelModeOther: '',
    amount: '',
    fromDate: '',
    toDate: '',
    journeyStartDate: '',
    clientLocation: '',
    projectName: '',
    receiptAvailable: '', // 'yes' | 'no'
    receiptNote: '',
    description: '',
};

export default function EmployeeExpensesPage() {
    const { data: session, status: sessionStatus } = useSession();
    const router = useRouter();
    const userId = session?.user?.id;
    const [claims, setClaims] = useState([]);
    const [hrNames, setHrNames] = useState([]);
    const [managerName, setManagerName] = useState('');
    const [managers, setManagers] = useState([]);
    const [managerId, setManagerId] = useState('');
    const [managerLoaded, setManagerLoaded] = useState(false);
    const [form, setForm] = useState(empty);
    const [receiptFile, setReceiptFile] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Team leads have no expense claim
    useEffect(() => {
        if (sessionStatus === 'authenticated' && session?.user?.role === 'TEAM_LEAD') router.replace('/dashboard');
    }, [sessionStatus, session, router]);

    const load = useCallback(async () => {
        const res = await fetch('/api/expenses');
        if (res.ok) {
            const data = await res.json();
            setClaims(data.claims || []);
            setHrNames(data.hrNames || []);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Reporting manager is shown read-only: the server always uses the stored manager link
    useEffect(() => {
        if (!userId) return;
        (async () => {
            try {
                const res = await fetch('/api/account/reporting-managers', { cache: 'no-store' });
                const data = await res.json();
                const list = data.managers || [];
                setManagers(list);
                setManagerId(data.currentId || '');
                setManagerName(list.find((m) => m.id === data.currentId)?.name || '');
            } catch {
                setManagerName('');
            } finally {
                setManagerLoaded(true);
            }
        })();
    }, [userId]);

    const change = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    const closeForm = () => {
        setShowForm(false);
        setError('');
    };

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        // Frontend validation (the server validates again)
        if (!form.category) return setError('Please select an expense category');
        if (form.category === 'TRAVEL') {
            if (!form.travelMode) return setError('Please select the mode of transport');
            if (form.travelMode === 'OTHER' && !form.travelModeOther.trim()) return setError('Please enter the mode of transport');
        }
        const amount = Number(form.amount);
        if (!form.amount || !Number.isFinite(amount) || amount <= 0) return setError('Enter an amount greater than 0');
        if (!form.fromDate || !form.toDate) return setError('From date and To date are required');
        if (form.fromDate < dayKey() || form.toDate < dayKey() || (form.journeyStartDate && form.journeyStartDate < dayKey())) {
            return setError('OD dates must be today or a future date. Past dates are not allowed.');
        }
        if (form.toDate < form.fromDate) return setError('To date cannot be before From date');
        if (!form.journeyStartDate) return setError('Journey start date is required');
        if (form.journeyStartDate > form.toDate) return setError('Journey start date cannot be after the To date');
        if (!form.clientLocation.trim()) return setError('Client location is required');
        if (!form.projectName.trim()) return setError('Project name is required');
        if (!managerId) return setError('Please select a reporting manager');
        if (!form.receiptAvailable) return setError('Please say whether you have the bill');
        if (form.receiptAvailable === 'yes' && !receiptFile) return setError('Please upload the bill');
        if (form.receiptAvailable === 'no' && !form.receiptNote.trim()) return setError('Please add a note explaining why there is no bill');

        setSubmitting(true);
        try {
            // 1) upload the bill (if there is one)
            let receiptUrl = null;
            if (form.receiptAvailable === 'yes') {
                const fd = new FormData();
                fd.append('file', receiptFile);
                fd.append('type', 'receipt');
                const up = await fetch('/api/upload', { method: 'POST', body: fd });
                const upData = await up.json();
                if (!up.ok) throw new Error(upData.error || 'Failed to upload the bill');
                receiptUrl = upData.url;
            }

            // 2) submit the claim: the server sends it to the reporting manager
            const res = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: form.category,
                    travelMode: form.category === 'TRAVEL' ? form.travelMode : null,
                    travelModeOther: form.category === 'TRAVEL' && form.travelMode === 'OTHER' ? form.travelModeOther : null,
                    amount,
                    fromDate: form.fromDate,
                    toDate: form.toDate,
                    journeyStartDate: form.journeyStartDate,
                    clientLocation: form.clientLocation,
                    projectName: form.projectName,
                    managerId,
                    receiptAvailable: form.receiptAvailable === 'yes',
                    receiptUrl,
                    receiptNote: form.receiptAvailable === 'no' ? form.receiptNote : null,
                    description: form.description || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit claim');
            setMessage(data.message);
            setForm(empty);
            setReceiptFile(null);
            setShowForm(false);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const field = 'k-input';
    const label = 'k-label block mb-1.5';
    const req = <span className="text-red-500">*</span>;
    const noManager = managerLoaded && !managerName;

    return (
        <PageShell
            title="Expense Claim"
            actions={
                <button
                    onClick={() => (showForm ? closeForm() : (setShowForm(true), setError('')))}
                    className="k-btn"
                >
                    {showForm ? 'Cancel' : '+ New claim'}
                </button>
            }
        >
            <div className="max-w-5xl space-y-6">
                {message && <div className="k-card px-5 py-3 text-sm font-semibold text-secondary-700 !bg-secondary-50">{message}</div>}
                {error && !showForm && <div className="k-card px-5 py-3 text-sm font-semibold text-red-600 !bg-red-50">{error}</div>}

                {showForm && (
                    <form onSubmit={submit} className="k-card k-rise p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
                        {error && (
                            <div className="md:col-span-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold px-4 py-3" role="alert">
                                {error}
                            </div>
                        )}

                        <div className="md:col-span-2">
                            <label className={label}>Expense category {req}</label>
                            <select name="category" value={form.category} onChange={change} className={field} required>
                                <option value="">Select category</option>
                                {Object.entries(EXPENSE_CATEGORIES).map(([value, text]) => (
                                    <option key={value} value={value}>{text}</option>
                                ))}
                            </select>
                        </div>

                        {form.category === 'TRAVEL' && (
                            <>
                                <div className={form.travelMode === 'OTHER' ? '' : 'md:col-span-2'}>
                                    <label className={label}>Mode of transport {req}</label>
                                    <select name="travelMode" value={form.travelMode} onChange={change} className={field} required>
                                        <option value="">Select mode</option>
                                        {Object.entries(TRAVEL_MODES).map(([value, text]) => (
                                            <option key={value} value={value}>{value === 'OTHER' ? 'Other (enter)' : text}</option>
                                        ))}
                                    </select>
                                </div>
                                {form.travelMode === 'OTHER' && (
                                    <div>
                                        <label className={label}>Enter mode {req}</label>
                                        <input name="travelModeOther" value={form.travelModeOther} onChange={change} maxLength={60} className={field} placeholder="e.g. Metro, Cab, Own vehicle" required />
                                    </div>
                                )}
                            </>
                        )}

                        <div>
                            <label className={label}>Amount (₹) {req}</label>
                            <input type="number" name="amount" value={form.amount} onChange={change} min="0.01" step="0.01" className={field} placeholder="0.00" required />
                        </div>
                        <div>
                            <label className={label}>Starting date of journey {req}</label>
                            <input type="date" name="journeyStartDate" value={form.journeyStartDate} min={dayKey()} onChange={change} className={field} required />
                        </div>

                        <div>
                            <label className={label}>From date {req}</label>
                            <input type="date" name="fromDate" value={form.fromDate} min={dayKey()} onChange={change} className={field} required />
                        </div>
                        <div>
                            <label className={label}>To date {req}</label>
                            <input type="date" name="toDate" value={form.toDate} min={form.fromDate && form.fromDate > dayKey() ? form.fromDate : dayKey()} onChange={change} className={field} required />
                        </div>

                        <div>
                            <label className={label}>Client location {req}</label>
                            <input name="clientLocation" value={form.clientLocation} onChange={change} maxLength={120} className={field} placeholder="City / site" required />
                        </div>
                        <div>
                            <label className={label}>Project name {req}</label>
                            <input name="projectName" value={form.projectName} onChange={change} maxLength={120} className={field} required />
                        </div>

                        <div className="md:col-span-2">
                            <label className={label}>Reporting manager {req}</label>
                            <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={field} required aria-label="Reporting manager">
                                <option value="">{managerLoaded ? 'Select reporting manager' : 'Loading...'}</option>
                                {managers.map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}{m.employeeId ? ` (${m.employeeId})` : ''}</option>
                                ))}
                            </select>
                            {managerLoaded && managers.length === 0 && <p className="mt-1.5 text-xs font-semibold text-red-600">No manager available</p>}
                        </div>

                        <div className="md:col-span-2">
                            <label className={label}>Receipt of bills {req}</label>
                            <select name="receiptAvailable" value={form.receiptAvailable} onChange={change} className={field} required>
                                <option value="">Select</option>
                                <option value="yes">Yes, I have the bill</option>
                                <option value="no">No, I do not have the bill</option>
                            </select>
                        </div>
                        {form.receiptAvailable === 'yes' && (
                            <div className="md:col-span-2">
                                <label className={label}>Upload bill {req}</label>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                                    className={field}
                                    required
                                />
                            </div>
                        )}
                        {form.receiptAvailable === 'no' && (
                            <div className="md:col-span-2">
                                <label className={label}>Reason for no bill {req}</label>
                                <textarea name="receiptNote" value={form.receiptNote} onChange={change} rows={2} maxLength={300} className={field} required placeholder="Reason" />
                            </div>
                        )}

                        <div className="md:col-span-2">
                            <label className={label}>Description</label>
                            <textarea name="description" value={form.description} onChange={change} rows={2} maxLength={300} className={field} />
                        </div>

                        <div className="md:col-span-2">
                            <button type="submit" disabled={submitting || noManager} className="k-btn">
                                {submitting ? 'Sending...' : 'Submit claim'}
                            </button>
                        </div>
                    </form>
                )}

                <section>
                    <p className="k-label mb-3">Claims</p>
                    <ExpenseTable claims={claims} showManager hrNames={hrNames} emptyText="No claims" />
                </section>
            </div>
        </PageShell>
    );
}
