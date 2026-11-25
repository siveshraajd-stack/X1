# Keystone HRMS

Human-resource management built with **Next.js 16 (App Router)**, **Prisma + PostgreSQL**, **NextAuth** (credentials, JWT) and Tailwind CSS.

## Roles
| Role | What they can do |
|---|---|
| **ADMIN** (HR) | Create employees/managers, manage holidays, see all attendance and leave, monthly attendance summary |
| **MANAGER** | Everything an employee can, plus approve/reject leave of their own reports and see their team's attendance summary (`/dashboard/team`) |
| **EMPLOYEE** | Mark attendance on the calendar, request leave, edit own profile |

## Features
- **Forced password change** - accounts created by HR (employee, team lead, manager - single form or Excel upload) all start with the same temporary password `Keystone123@` and `mustChangePassword = true`. Until the password is changed the user can reach only `/auth/change-password` (pages *and* API are blocked). The same page is available any time from the sidebar. Rule: 8+ characters, 1 uppercase, 1 number, 1 special character, new != old, passwords hashed with bcrypt.
- **Employee calendar** (`/dashboard/attendance`) - yellow = festival holiday, orange = weekend, plus a color per attendance status and a legend. Click a day to mark **Present / Absent / Late / WFH / On Duty**.
- **Office timing** - reporting 9:00 AM, end 5:30 PM (India time). Marking Present or WFH after 9:00 AM becomes **Late** automatically. On Duty is exempt.
- **Late-to-leave rule** - every 5th late mark in a calendar month (5, 10, 15 ...) creates 1 auto-approved leave day (deducted from balance as Casual, or **LOP** when no balance is left) and notifies the employee. The calendar shows `Late count this month: X/5`; the count resets every month. The deduction is idempotent (one per block).
- **Clock In / Clock Out vs Check In / Check Out** - the buttons on the employee dashboard are **Clock In / Clock Out** (self service, stored as `clockIn` / `clockOut`). **Check In / Check Out** come only from the **fingerprint machine**: the first punch of the day is the Check In, the last punch is the Check Out (stored as `checkIn` / `checkOut`). The dashboard shows both; the admin attendance table has a column for each.
- **Biometric integration** - the machine (or its cloud service) sends punches to `POST /api/biometric/punches` with the header `x-api-key: <BIOMETRIC_API_KEY>`. Each employee's *Biometric ID* (set when creating or editing the employee) links the machine's user number to the person. The 9:00 AM late rule, the 5-late-marks leave deduction and the holiday/weekend/leave rules all apply to punch times. Punches from an unknown id are kept (Admin > Biometric) and applied automatically once the id is assigned. Re-sending the same punches is safe.
- **Holidays** - admin page `/admin/holidays`: add festival holidays, add national fixed-date holidays for a year, and *allow attendance* on a specific holiday/weekend date. Attendance on holidays/weekends is blocked otherwise (server enforced).
- **Leave requests** - Time Off Category dropdown (Sick, Casual, Earned, LOP, Compensate, Restricted Holiday), From/To date and a **required Reason** (validated in the form and on the server). Days are counted as working days (weekends/holidays excluded). Overlapping requests are rejected.
- **Leave routing** - the request is saved as `PENDING`, assigned to the employee's manager only, shows only in that manager's approval list, and an email with Approve/Reject buttons goes to the manager (Reply-To = employee). The decision emails the employee back. If no manager is assigned the employee gets an error and every admin is notified.
- **Manager required** - the Create Employee form needs the employee email, a manager (dropdown of existing managers/admins) and the manager's email; the backend validates all of them and stores `managerId` + `managerEmail`.
- **Attendance summary** - Present / Absent / Late / WFH / OD / Leave counts per employee per month for admins (`/admin/attendance/summary`) and managers (their team).
- **No financial data** - salary, payroll, bank, PAN/UAN, CTC etc. were removed from UI, API, schema and docs.

## Setup
```bash
npm install
cp .env.example .env        # fill DATABASE_URL, NEXTAUTH_SECRET and SMTP settings
npx prisma db push          # see "Upgrading an existing database" below
node prisma/seed.js         # optional demo data
npm run dev
```

### Email (SMTP)
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` in `.env` (see `.env.example`; Gmail needs an App Password). `NEXTAUTH_URL` must be the public URL because it is used in the Approve/Reject links. Most providers cannot send *as* the employee, so mails are sent from `FROM_EMAIL` with the employee's name and **Reply-To** set to the employee; set `MAIL_SEND_AS_SENDER=true` if your provider allows custom senders. Without SMTP the app keeps working and logs the email to the server console.

### Biometric API
```bash
curl -X POST http://localhost:3000/api/biometric/punches \
  -H "x-api-key: YOUR_BIOMETRIC_API_KEY" -H "Content-Type: application/json" \
  -d '{"punches":[{"biometricId":"101","timestamp":"2026-11-18 08:55:00","deviceId":"SN1"}]}'
```
One punch, an array, or `{ "punches": [...] }` / `{ "data": [...] }` are accepted. Common vendor field names (`emp_code`, `punch_time`, `terminal_sn` ...) are understood. A time without a zone is read as India time (IST); ISO times with `Z` or an offset, `DD/MM/YYYY HH:mm`, and epoch seconds/milliseconds also work. Set `BIOMETRIC_API_KEY` (16+ characters) in `.env`, and `BIOMETRIC_COMPANY_ID` only if the database holds more than one company.

### Upgrading an existing database
This project uses `prisma db push` (no migration history). The new schema **drops** the salary/payroll tables and bank columns and adds the manager, holiday and late-rule fields.
1. Back up the database.
2. Make sure every employee has a manager before they request leave (Admin > employee > Edit > Manager).
3. `npx prisma db push --accept-data-loss` - the data loss is the removed financial data. If duplicate attendance rows exist for the same user and day, remove them first (`@@unique([userId, date])` is new).
4. Optional, once: move the old self-service times into the new Clock columns so they are not shown as biometric times: `UPDATE attendances SET "clockIn" = "checkIn", "clockOut" = "checkOut", "checkIn" = NULL, "checkOut" = NULL WHERE "clockIn" IS NULL AND "clockOut" IS NULL;`
5. Default `@kaspl.net` employee and manager accounts are now also forced to set their own password at first login (HR is not). Existing users keep `mustChangePassword = true` (the column default), so everyone changes their password once on next login. Run `UPDATE users SET "mustChangePassword" = false WHERE role = 'ADMIN';` if you do not want admins prompted.

### Leave approval flow (two steps)
Employee request -> **Manager** dashboard (`/dashboard/team`) -> **HR** dashboard (`/admin/time-off`, tab "Awaiting HR").
- Manager approves: the request moves to HR; the employee is not told yet. HR gets a notification.
- HR approves too: the employee sees **Leave accepted** (notification + email).
- Manager rejects: the employee sees **Not accepted**; HR is not notified and the request never appears in HR's list.
- HR rejects (after the manager approved): the employee sees **Not accepted**.
- If HR is the employee's assigned manager (or no manager is assigned), HR's decision is final in one step.
New columns on `leave_requests`: `hrComment`, `rejectedBy`, `managerDecidedAt` (+ an index on `status`), and the status value `MANAGER_APPROVED`. Run `npx prisma db push` once; no data is lost and existing rows keep working (old PENDING requests stay with the manager).

### Demo logins (after seeding)
`admin@keystone.com / admin123`, `hr@keystone.com / hr123` (admins) - `jane.smith@keystone.com / emp123` (manager) - `employee@keystone.com / emp123` (reports to Jane). Employees and the manager must change the password at first login.

## Business rules in one place
`lib/constants.js` holds the office timing, late block size (5), leave categories and yearly quotas (`LEAVE_QUOTAS`: Sick 8 days, Casual 8 days; each has its own balance that drops when a request is finally accepted). Date logic is pinned to India Standard Time in `lib/dates.js`; attendance rules live in `lib/attendance-core.js`, leave and email logic in `lib/leave.js`.

## Scripts
`npm run dev | build | start | lint | test`

## Tests
`npm test` covers date handling, the late rule (auto-late, 5th/10th-late deduction, LOP fallback, month reset, idempotency), holiday/weekend guards, calendar colors and the validation rules.

## Default logins (@kaspl.net)

| Role | Email | Password |
|------|-------|----------|
| HR | hr@kaspl.net | Hr123@ |
| Manager | manager@kaspl.net | Manager123@ |
| Employee | any-name@kaspl.net | Emp123@ |

Accounts are created automatically on first login with the default password. Every login
email + password is visible to HR under **HR dashboard → Login Credentials**.
Users can reset their password from **Forgot password?** on the login page.

## Latest changes (x8 updated)
- **Sign in page**: heading is just "Sign In"; the registration link was removed.
- **Forgot password**: enter work email or employee ID -> a temporary password is e-mailed to the **personal email in the profile** (valid 60 min, SMTP must be configured). Sign in with it, then choose a new password. The old password keeps working until the temporary one is used. HR / managers / team leads set their personal email in their profile (Name section).
- **Names**: HR, managers and team leads have a **Name** section on their profile (HR: `/admin/profile`, others: `/profile`). Notifications to employees show `From: <that name>` (stored in `notifications.senderName`).
- **Calendar** shows **LOP** instead of Absent (also in the monthly summary table).
- **Work From Home** is a request type on the leave form. After the full approval chain the calendar shows WFH on each working day (no leave balance used).
- **Approvals** (HR "Leave Requests" and manager "My Team > Leave") can be filtered: On Leave / Work From Home / Absent (LOP). HR attendance has a Work from home tab and dashboard tile.
- Approved OD expense claims mark OD on the calendar; leave and OD claims for past dates are rejected on submit.
- **Database**: run `npx prisma db push` once (adds `users.resetPasswordHash`, `users.resetPasswordExpiry`, `notifications.senderName`).

## x9 changes
- Login page: the "Input credentials to authorize session" line was removed.
- HR dashboard: **EDIT** and **REMOVE** buttons on every employee row. Remove asks for confirmation and is refused while the person still manages employees (reassign them first).
- HR can edit all details of an employee: name, login email, employee ID, role (Employee / Manager-Team lead), phone, parent name/phone, birth date, gender, marital status, nationality, address, personal email, position, department, manager, biometric ID, date of joining, work location, about.
- **On Duty (OD)** is a request type on the leave form. After the full approval chain the calendar shows OD on each working day (no leave balance used); an approved OD day cannot be changed to Present.


## Work hours, breaks and cursor inactivity

- **Unpaid breaks** (`UNPAID_BREAKS` in `lib/constants.js`): 10:15-10:30, lunch 1:00-2:00 PM and 3:30-3:45 PM (IST) are never counted in working hours (dashboards, calendar, admin totals).
- **Cursor inactivity** (employee dashboard only, `components/dashboard/idle-monitor.jsx`): after 5 minutes without cursor movement the employee gets a notification (once per idle stretch); every further minute is counted as idle minutes. Breaks, lunch and Teams meetings are never counted. Only runs while the employee is clocked in.
- **Teams meetings**: set `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (see `.env.example`).
- New table `idle_episodes`: run `npx prisma db push` once (no data is lost).


## x13 changes
- **Monthly paid leave**: 2 days a month (Sick + Casual together). Extra days in a request are split off automatically as a separate **LOP** request (the employee sees a message). Yearly quotas still apply to the paid part.
- **HR employee profile**: tabs renamed to *About / Private Info / Attendance*, with plain field names.
- **Analytics export**: *Export Data* on `/admin/analytics` downloads a CSV (summary, attendance, leave, departments, per-employee hours and idle time).
- **Idle time** (today / month) is shown per employee on the HR dashboard.
- **Temporary password** field removed from *Add employee*; every new account starts with `Keystone123@`.
