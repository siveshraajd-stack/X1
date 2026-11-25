'use client';

import { LEAVE_KINDS, leaveKindOf } from '@/lib/constants';

/** Does this request belong to the selected group? ('ALL' = everything) */
export function matchesLeaveKind(leave, kind) {
    return kind === 'ALL' || leaveKindOf(leave.type) === kind;
}

/**
 * Chips on the approval pages that split the requests into
 * On Leave / Work From Home / Absent (LOP), each with its count.
 */
export function LeaveKindFilter({ leaves, value, onChange, hideAbsent = false }) {
    const kinds = Object.entries(LEAVE_KINDS).filter(([key]) => !(hideAbsent && key === 'ABSENT'));
    const options = [['ALL', 'All types'], ...kinds];
    return (
        <div className="flex flex-wrap gap-2 items-center" role="group" aria-label="Request type">
            {options.map(([key, text]) => {
                const count = key === 'ALL' ? leaves.length : leaves.filter((l) => leaveKindOf(l.type) === key).length;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                            value === key ? 'bg-primary-700 text-white shadow-lift' : 'bg-white/80 text-primary-700 border border-[var(--line)] hover:bg-white'
                        }`}
                    >
                        {text} ({count})
                    </button>
                );
            })}
        </div>
    );
}
