// Names of the people in the approval chain.
// Every notification, email and status label shows the real person ("Ravi Kumar (Manager)"),
// never just "your manager" / "HR". The role is only a fallback when a name is missing.

/** "Ravi Kumar (Manager)"; just "Manager" when the person has no usable name. */
export function personLabel(person, role) {
    const name = String(person?.name ?? person ?? '').trim();
    if (!name || name === '[object Object]') return role || '';
    // A placeholder name that is just the role ("HR", "Manager") must not read "HR (HR)"
    if (role && name.toLowerCase() === String(role).toLowerCase()) return role;
    return role ? `${name} (${role})` : name;
}

/** "A", "A and B", "A, B and C" - at most `max` names, the rest as "+N more". */
export function joinNames(names, max = 3) {
    const clean = [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))];
    if (clean.length === 0) return '';
    if (clean.length === 1) return clean[0];
    const shown = clean.slice(0, max);
    const extra = clean.length - shown.length;
    if (extra > 0) return `${shown.join(', ')} +${extra} more`;
    return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}
