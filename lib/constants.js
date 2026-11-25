// Central place for business rules. Change values here (or via env) only.

// ---- Office timing (Asia/Kolkata) -----------------------------------------
export const OFFICE_START_HOUR = 9; // reporting time 9:00 AM
export const OFFICE_START_MINUTE = 0;
export const OFFICE_END_LABEL = '5:30 PM'; // end time (informational)

// ---- Unpaid breaks (IST, 24h "HH:MM") ---------------------------------------
// Time inside these windows is NOT counted as working hours.
export const UNPAID_BREAKS = [
    { label: 'Morning break', start: '10:15', end: '10:30' },
    { label: 'Lunch', start: '13:00', end: '14:00' },
    { label: 'Afternoon break', start: '15:30', end: '15:45' },
];

// ---- Cursor inactivity (employee dashboard only) ------------------------------
export const IDLE_THRESHOLD_MINUTES = 5; // no cursor movement for this long = idle; minutes after it are counted
export const IDLE_HEARTBEAT_MS = 60 * 1000; // while idle, the dashboard reports every minute
export const IDLE_STATE_REFRESH_MS = 5 * 60 * 1000; // dashboard re-reads meetings / totals this often
export const IDLE_MAX_EPISODE_MS = 16 * 60 * 60 * 1000; // sanity ceiling for one report

// ---- First password of every new account (employee, team lead, manager) created by HR ----
// The person must change it at first login (mustChangePassword).
export const DEFAULT_TEMP_PASSWORD = 'Keystone123@';

// ---- Departments offered when HR adds ONE employee with the form (Excel upload stays free text) ----
export const DEPARTMENTS = ['IT', 'Automation', 'Management', 'Accounts'];

// ---- Late rule -------------------------------------------------------------
export const LATE_BLOCK_SIZE = 5; // every 5th late mark in a month = 1 day leave
// Marking one of these statuses after 9:00 AM converts the day into LATE.
// OD (On Duty) is official work away from the desk, so it is exempt.
export const LATE_AUTO_STATUSES = ['PRESENT', 'WFH'];

// ---- Biometric ----
// Two punches closer than this are one scan, not check-in + check-out.
export const MIN_CHECKOUT_GAP_MS = 10 * 60 * 1000;

// ---- Attendance ------------------------------------------------------------
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'WFH', 'OD'];

// ---- Leave -----------------------------------------------------------------
export const LEAVE_TYPES = {
    SICK: 'Sick',
    CASUAL: 'Casual',
    EARNED: 'Earned',
    LOP: 'LOP (Loss of Pay)',
    COMPENSATE: 'Compensate',
    RESTRICTED_HOLIDAY: 'Restricted Holiday',
    WFH: 'Work From Home',
    OD: 'On Duty (OD)',
};
export const LEAVE_TYPE_KEYS = Object.keys(LEAVE_TYPES);

// Default yearly quota per category (HR can set a different Sick / Casual quota per person). Only these categories are limited; each one has its own
// balance that goes down when a request of that category is finally accepted.
export const LEAVE_QUOTAS = { SICK: 8, CASUAL: 8 };
export const BALANCE_LEAVE_TYPES = Object.keys(LEAVE_QUOTAS);
export const ANNUAL_LEAVE_ALLOWANCE = Object.values(LEAVE_QUOTAS).reduce((a, b) => a + b, 0); // 16 in total
// Paid leave limit per calendar month: Sick + Casual together. Any day beyond this is LOP (loss of pay).
export const MONTHLY_PAID_LEAVE_LIMIT = 2;
export const MAX_LEAVE_QUOTA = 60; // highest yearly Sick / Casual quota HR can give one person
export const MAX_LEAVE_RANGE_DAYS = 90;

// Approve / Reject email links stay valid for this long.
export const LEAVE_ACTION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Weekly off days (0 = Sunday, 6 = Saturday)
export const WEEKEND_DAYS = [0, 6];

// Leave approval flow: employee -> team lead -> manager -> HR -> employee.
//   PENDING             waiting for the team lead
//   TEAM_LEAD_APPROVED  team lead said yes, waiting for the manager
//                       (skipped when the team lead reports straight to HR)
//   MANAGER_APPROVED    manager said yes, waiting for HR
//   APPROVED            HR said yes too (final, the only state that counts as leave)
//   REJECTED            anybody in the chain said no (final, the employee is told who)
export const LEAVE_STATUS = {
    PENDING: 'PENDING',
    TEAM_LEAD_APPROVED: 'TEAM_LEAD_APPROVED',
    MANAGER_APPROVED: 'MANAGER_APPROVED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
};
// Requests that still occupy their dates (used for overlap checks)
export const OPEN_LEAVE_STATUSES = ['PENDING', 'TEAM_LEAD_APPROVED', 'MANAGER_APPROVED', 'APPROVED'];
// Requests that are still waiting for somebody's decision (days are reserved, not yet deducted)
export const WAITING_LEAVE_STATUSES = ['PENDING', 'TEAM_LEAD_APPROVED', 'MANAGER_APPROVED'];

export const MANAGER_ROLES = ['TEAM_LEAD', 'MANAGER', 'ADMIN'];

export function leaveTypeLabel(type) {
    return LEAVE_TYPES[type] || String(type || '').replace(/_/g, ' ');
}

// Work From Home and On Duty (OD) are requested on the same form but are NOT leave: no balance is
// used, and once finally approved the calendar shows WFH / OD (not On Leave).
export const WFH_TYPE = 'WFH';
export const NON_LEAVE_TYPES = ['WFH', 'OD'];
export const isWfhType = (type) => type === WFH_TYPE;
export const isNonLeaveType = (type) => NON_LEAVE_TYPES.includes(type);

/** "Leave" / "Work from home" / "On duty" - first word of titles and mails. */
export function requestWord(type) {
    return type === 'WFH' ? 'Work from home' : type === 'OD' ? 'On duty' : 'Leave';
}

/** "Casual leave" / "Work From Home request" / "On Duty (OD) request" - used inside sentences. */
export function leaveNoun(type) {
    return isNonLeaveType(type) ? `${leaveTypeLabel(type)} request` : `${leaveTypeLabel(type)} leave`;
}

// Filter groups on the approval pages (HR / manager / team lead)
//   ON_LEAVE  every normal leave category
//   WFH       work from home requests
//   ABSENT    LOP (loss of pay) = the days the employee is absent without pay
export const LEAVE_KINDS = { ON_LEAVE: 'On Leave', WFH: 'Work From Home', OD: 'On Duty (OD)', ABSENT: 'Absent (LOP)' };
export function leaveKindOf(type) {
    if (type === 'WFH') return 'WFH';
    if (type === 'OD') return 'OD';
    if (type === 'LOP') return 'ABSENT';
    return 'ON_LEAVE';
}

// ---- On-duty (OD) expense claims ---------------------------------------------
// Employee submits -> reporting manager approves / rejects (single step).
export const EXPENSE_CATEGORIES = {
    TRAVEL: 'Travel',
    ACCOMMODATION: 'Accommodation',
    FOOD: 'Food',
    LOCAL_CONVEYANCE: 'Local conveyance',
    OFFICE_SUPPLIES: 'Office supplies',
    CLIENT_ENTERTAINMENT: 'Client entertainment',
};
export const EXPENSE_CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES);

// Mode of transport, only asked when the category is Travel. OTHER lets the person type it.
export const TRAVEL_MODES = { FLIGHT: 'Flight', TRAIN: 'Train', BUS: 'Bus', OTHER: 'Other' };
export const TRAVEL_MODE_KEYS = Object.keys(TRAVEL_MODES);

export const EXPENSE_STATUS = { PENDING: 'PENDING', MANAGER_APPROVED: 'MANAGER_APPROVED', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };
export const MAX_EXPENSE_AMOUNT = 10000000; // sanity ceiling (1 crore)

export function expenseCategoryLabel(key) {
    return EXPENSE_CATEGORIES[key] || String(key || '').replace(/_/g, ' ');
}
export function travelModeLabel(key) {
    return TRAVEL_MODES[key] || String(key || '').replace(/_/g, ' ');
}
