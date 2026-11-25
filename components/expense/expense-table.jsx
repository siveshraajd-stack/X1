'use client';

import { useState } from 'react';
import { expenseCategoryLabel, travelModeLabel } from '@/lib/constants';

const STATUS_CLASS = {
    PENDING: 'bg-primary-100 text-primary-700',
    MANAGER_APPROVED: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-secondary-100 text-secondary-700',
    REJECTED: 'bg-red-100 text-red-700',
};
const DOT_CLASS = { PENDING: 'bg-primary-500', MANAGER_APPROVED: 'bg-amber-500', APPROVED: 'bg-secondary-500', REJECTED: 'bg-red-500' };
const STATUS_LABEL = {
    PENDING: 'Pending (manager)',
    MANAGER_APPROVED: 'Accepted by manager · waiting for HR',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
};
const nameOr = (name, role) => (name ? `${name} (${role})` : role);
const hrText = (hrNames) => (hrNames && hrNames.length ? hrNames.slice(0, 3).join(', ') + (hrNames.length > 3 ? ` +${hrNames.length - 3} more` : '') + ' (HR)' : 'HR');

// Status text with the real names: who it is waiting for, who approved, who rejected
function statusText(claim, hrNames) {
    if (claim.status === 'PENDING') return `Pending · ${nameOr(claim.manager?.name, 'Manager')}`;
    if (claim.status === 'MANAGER_APPROVED') {
        return `Accepted by ${nameOr(claim.managerDecidedByName || claim.manager?.name, 'Manager')} · waiting for ${hrText(hrNames)}`;
    }
    if (claim.status === 'APPROVED') return claim.hrDecidedByName ? `Approved by ${claim.hrDecidedByName} (HR)` : 'Approved';
    if (claim.status === 'REJECTED') {
        if (claim.rejectedBy === 'HR') return `Rejected by ${nameOr(claim.hrDecidedByName, 'HR')}`;
        if (claim.rejectedBy === 'MANAGER') return `Rejected by ${nameOr(claim.managerDecidedByName || claim.manager?.name, 'Manager')}`;
        return 'Rejected';
    }
    return STATUS_LABEL[claim.status] || claim.status;
}

// Dates are stored as midnight IST; show the IST calendar day as DD-MM-YYYY
const istDay = (d) => new Date(new Date(d).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
const fmt = (d) => istDay(d).split('-').reverse().join('-');
const money = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function title(claim) {
    const base = expenseCategoryLabel(claim.category);
    if (claim.category !== 'TRAVEL' || !claim.travelMode) return base;
    return `${base} · ${claim.travelMode === 'OTHER' ? claim.travelModeOther || 'Other' : travelModeLabel(claim.travelMode)}`;
}

export function ExpenseTable({ claims, showEmployee = false, showManager = false, onDecide, hrNames = [], emptyText = 'No expense claims' }) {
    const [busyId, setBusyId] = useState(null);

    const decide = async (claim, status) => {
        let comment;
        if (status === 'REJECTED') {
            const answer = window.prompt('Reason for denying (required):');
            if (answer === null) return; // cancelled: do not reject
            if (!answer.trim()) {
                window.alert('A reason is required to deny a claim.');
                return;
            }
            comment = answer.trim().slice(0, 300);
        }
        setBusyId(claim.id);
        try {
            await onDecide(claim.id, status, comment);
        } finally {
            setBusyId(null);
        }
    };

    if (claims.length === 0) {
        return (
            <div className="k-card p-12 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center text-primary-500 text-2xl">∅</div>
                <p className="mt-4 text-sm font-semibold text-[var(--ink-soft)]">{emptyText}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {claims.map((claim) => (
                <article key={claim.id} className="k-card k-card-hover p-5 flex flex-wrap items-start gap-x-6 gap-y-3">
                    <div className="flex items-start gap-4 min-w-[220px] flex-1">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-700 text-white flex items-center justify-center font-bold text-lg shrink-0">
                            {(showEmployee ? claim.user?.name : expenseCategoryLabel(claim.category))?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            {showEmployee && (
                                <p className="font-bold text-sm truncate">
                                    {claim.user?.name} <span className="text-[11px] text-[var(--ink-soft)] font-semibold">{claim.user?.employeeId}</span>
                                </p>
                            )}
                            <p className={showEmployee ? 'text-xs font-semibold text-primary-700' : 'font-bold text-sm'}>{title(claim)}</p>
                            <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                                {fmt(claim.fromDate)} → {fmt(claim.toDate)}
                            </p>
                            <p className="text-[11px] text-[var(--ink-soft)] mt-0.5">Journey started {fmt(claim.journeyStartDate)}</p>
                        </div>
                    </div>

                    <div className="text-center px-2">
                        <p className="text-2xl font-bold leading-none">{money(claim.amount)}</p>
                        <p className="k-label mt-1">amount</p>
                    </div>

                    <div className="flex-[2] min-w-[220px] max-w-md space-y-1.5">
                        <p className="text-sm">
                            <span className="k-label mr-2">Project</span>
                            <b>{claim.projectName}</b>
                        </p>
                        <p className="text-sm">
                            <span className="k-label mr-2">Client location</span>
                            {claim.clientLocation}
                        </p>
                        <p className="text-sm">
                            <span className="k-label mr-2">Bill</span>
                            {claim.receiptAvailable ? (
                                <a href={claim.receiptUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">
                                    View bill
                                </a>
                            ) : (
                                <span className="text-amber-700 font-semibold">No bill: {claim.receiptNote}</span>
                            )}
                        </p>
                        {claim.description && <p className="text-xs text-[var(--ink-soft)] break-words">{claim.description}</p>}
                        {showEmployee && typeof claim.odDays === 'number' && (
                            <p className="text-[11px] font-semibold text-[var(--ink-soft)]">
                                Marked On Duty on {claim.odDays} of {claim.totalDays} day{claim.totalDays === 1 ? '' : 's'} in attendance
                            </p>
                        )}
                        {showManager && (
                            <p className="text-[11px] text-[var(--ink-soft)]">
                                Sent to <b>{claim.manager?.name || 'Unassigned'}</b>
                            </p>
                        )}
                        {claim.managerComment && claim.status !== 'PENDING' && (
                            <p className="text-[11px] text-[var(--ink-soft)]">
                                <b>Manager comment:</b> {claim.managerComment}
                            </p>
                        )}
                        {claim.hrComment && (
                            <p className="text-[11px] text-[var(--ink-soft)]">
                                <b>HR comment:</b> {claim.hrComment}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-2 ml-auto">
                        <span className={`k-chip ${STATUS_CLASS[claim.status] || 'bg-gray-100 text-gray-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASS[claim.status] || 'bg-gray-400'}`} />
                            {statusText(claim, hrNames)}
                        </span>
                        {onDecide && claim.canDecide && (
                            <div className="flex gap-2">
                                <button
                                    disabled={busyId === claim.id}
                                    onClick={() => decide(claim, 'APPROVED')}
                                    className="px-4 py-1.5 rounded-full bg-secondary-600 hover:bg-secondary-700 text-white text-xs font-bold disabled:opacity-50"
                                >
                                    Accept
                                </button>
                                <button
                                    disabled={busyId === claim.id}
                                    onClick={() => decide(claim, 'REJECTED')}
                                    className="px-4 py-1.5 rounded-full bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold disabled:opacity-50"
                                >
                                    Deny
                                </button>
                            </div>
                        )}
                    </div>
                </article>
            ))}
        </div>
    );
}
