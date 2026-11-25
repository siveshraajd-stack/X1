import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { errorResponseParts } from '@/lib/errors';
import { DEFAULT_TEMP_PASSWORD } from '@/lib/constants';
import { POST as createEmployee } from '../route';
import SAMPLE from '@/lib/bulk-sample.json';

export const runtime = 'nodejs';

const MAX_ROWS = 200;

// Excel column title -> field. Headers are matched ignoring case, spaces and symbols.
const COLUMNS = [
    ['fullName', 'Employee Name', ['fullname', 'name', 'employeename']],
    ['jobPosition', 'Designation', ['jobposition', 'position', 'designation']],
    ['department', 'Department', ['department']],
    ['divisionSection', 'Division/Section', ['divisionsection', 'division', 'section']],
    ['employmentStatus', 'Status', ['status']],
    ['city', 'City', ['city']],
    ['residingAddress', 'Correspondence Address', ['address', 'residingaddress', 'correspondenceaddress']],
    ['permanentAddress', 'Permanent Address', ['permanentaddress']],
    ['phone', 'Mobile Number', ['phone', 'phonenumber', 'contact', 'contactnumber', 'mobile', 'mobilenumber']],
    ['alternateMobile', 'Alternate Mobile Number', ['alternatemobile', 'alternatemobilenumber']],
    ['email', 'Official Mail ID', ['email', 'employeeemail', 'loginemail', 'officialmailid', 'officialmail']],
    ['personalEmail', 'Personal E-mail ID', ['personalemail', 'personalemailid']],
    ['dateOfBirth', 'DOB', ['dateofbirth', 'dob']],
    ['gender', 'Gender', ['gender']],
    ['maritalStatus', 'Marital Status', ['maritalstatus']],
    ['bloodGroup', 'Blood Group', ['bloodgroup']],
    ['dateOfJoining', 'DOJ', ['dateofjoining', 'joiningdate', 'doj']],
    ['emergencyContactName', 'Emergency Contact Name', ['emergencycontactname']],
    ['emergencyContactNumber', 'Emergency Contact Number', ['emergencycontactnumber']],
    ['emergencyContactRelation', 'Emergency Contact Relation', ['emergencycontactrelation']],
    ['uanNumber', 'UAN Number', ['uannumber', 'uan']],
    ['pfNumber', 'PF Number', ['pfnumber']],
    ['dojInPf', 'DOJ in PF', ['dojinpf']],
    ['dol', 'DOL', ['dol', 'dateofleaving']],
    ['rol', 'ROL', ['rol', 'reasonofleaving']],
    ['probationStatus', 'Probation/Confirmation', ['probationconfirmation', 'probation', 'confirmation']],
    ['dateOfConfirmation', 'Date of Confirmation', ['dateofconfirmation']],
    ['esicNumber', 'ESIC Number', ['esicnumber', 'esic']],
    ['cubAccountNumber', 'CUB Account Number', ['cubaccountnumber', 'cubaccount']],
    ['personalBankAccount', 'Personal Bank Account', ['personalbankaccount']],
    ['ifscCode', 'IFSC Code', ['ifsccode', 'ifsc']],
    ['bankName', 'Bank Name', ['bankname']],
    ['salary', 'Salary', ['salary']],
    ['panNo', 'PAN No', ['panno', 'pan', 'pannumber']],
    ['aadhaarNo', 'Aadhaar No', ['aadhaarno', 'aadhaar', 'aadhaarnumber', 'aadharno']],
    ['managerEmail', 'Manager Email', ['manageremail']],
    ['workLocation', 'Work Location', ['worklocation', 'location']],
    ['role', 'Role', ['role']],
    ['biometricId', 'Biometric ID', ['biometricid']],
    ['parentName', 'Parent Name', ['parentname']],
    ['parentPhone', 'Parent Phone', ['parentphone', 'parentnumber']],
];

// Extra sheets: one row per family member / qualification / job, linked by Official Mail ID.
const LIST_SHEETS = {
    familyMembers: {
        sheet: 'Family',
        columns: [
            ['name', 'Family Member Name'], ['relationship', 'Relationship'], ['dob', 'DOB'], ['gender', 'Gender'],
            ['occupation', 'Occupation'], ['contact', 'Contact Number'], ['dependent', 'Dependent/Non-Dependent'], ['nominee', 'Nominee'],
        ],
    },
    education: {
        sheet: 'Academic',
        columns: [
            ['qualification', 'Qualification'], ['course', 'Course/Degree'], ['specialization', 'Specialization'],
            ['institution', 'Institution/University'], ['yearOfPassing', 'Year of Passing'], ['percentage', 'Percentage/CGPA'],
            ['additionalQualification', 'Additional Qualification'], ['certification', 'Certification'],
        ],
    },
    experience: {
        sheet: 'Experience',
        columns: [
            ['company', 'Previous Company'], ['designation', 'Designation'], ['department', 'Department'],
            ['dateOfJoining', 'Date of Joining'], ['dateOfLeaving', 'Date of Leaving'], ['totalExperience', 'Total Experience'],
            ['reasonForLeaving', 'Reason for Leaving'],
        ],
    },
};
const EMAIL_COLUMN = 'Official Mail ID';

// Matches what was typed ("active", "MALE") to the exact value the system stores
const pick = (options, value) => options.find((o) => o.toLowerCase() === String(value || '').trim().toLowerCase()) || String(value || '').trim();
const STATUS = ['Active', 'Inactive', 'On Notice', 'Resigned', 'Terminated'];
const PROBATION = ['Probation', 'Confirmed'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other'];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cellText(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('').trim();
        if (value.result !== undefined) return cellText(value.result);
        if (value.text !== undefined) return cellText(value.text);
        return '';
    }
    return String(value).trim();
}

// GET: Excel template with 3 sample employees (replace the samples with real people)
export async function GET() {
    try {
        await requireUser({ roles: ['ADMIN'] });
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Employees');
        ws.columns = COLUMNS.map(([, title]) => ({ header: title, key: title, width: Math.max(18, title.length + 4) }));
        ws.getRow(1).font = { bold: true };
        // Numbers such as account / Aadhaar / phone must stay text so leading zeros are kept
        ws.columns.forEach((c) => { c.numFmt = '@'; });
        for (const row of SAMPLE.employees) ws.addRow(row);

        for (const [listKey, def] of Object.entries(LIST_SHEETS)) {
            const sheet = wb.addWorksheet(def.sheet);
            const titles = [EMAIL_COLUMN, ...def.columns.map(([, t]) => t)];
            sheet.columns = titles.map((t) => ({ header: t, key: t, width: Math.max(20, t.length + 4), style: { numFmt: '@' } }));
            sheet.getRow(1).font = { bold: true };
            for (const row of SAMPLE[listKey]) sheet.addRow(row);
        }

        const buffer = await wb.xlsx.writeBuffer();
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="employees-template.xlsx"',
            },
        });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Failed to create template');
        return NextResponse.json(body, { status });
    }
}

// POST: Excel file -> one account per row
export async function POST(request) {
    try {
        const admin = await requireUser({ roles: ['ADMIN'] });
        if (!admin.companyId) return NextResponse.json({ error: 'HR user company not found' }, { status: 400 });

        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') return NextResponse.json({ error: 'Choose an Excel file' }, { status: 400 });
        if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
            return NextResponse.json({ error: 'Upload a .xlsx Excel file' }, { status: 400 });
        }

        const wb = new ExcelJS.Workbook();
        try {
            await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));
        } catch {
            return NextResponse.json({ error: 'Could not read the Excel file' }, { status: 400 });
        }
        const ws = wb.worksheets[0];
        if (!ws) return NextResponse.json({ error: 'The Excel file is empty' }, { status: 400 });

        // Map header titles to fields
        const colOf = {};
        ws.getRow(1).eachCell((cell, col) => {
            const key = norm(cellText(cell.value));
            const match = COLUMNS.find(([, , aliases]) => aliases.includes(key));
            if (match && !colOf[match[0]]) colOf[match[0]] = col;
        });
        const missing = ['fullName', 'email', 'jobPosition', 'department', 'dateOfJoining', 'managerEmail']
            .filter((f) => !colOf[f])
            .map((f) => COLUMNS.find(([k]) => k === f)[1]);
        if (missing.length) {
            return NextResponse.json({ error: `Missing column title: ${missing.join(', ')}` }, { status: 400 });
        }

        const rows = [];
        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const data = {};
            for (const [field] of COLUMNS) data[field] = colOf[field] ? cellText(row.getCell(colOf[field]).value) : '';
            if (Object.values(data).some(Boolean)) rows.push({ rowNumber, data });
        });
        if (!rows.length) return NextResponse.json({ error: 'No employee rows found' }, { status: 400 });
        if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Maximum ${MAX_ROWS} employees at a time` }, { status: 400 });

        // Family / Academic / Experience sheets, grouped by Official Mail ID
        const listRows = { familyMembers: new Map(), education: new Map(), experience: new Map() };
        for (const [listKey, def] of Object.entries(LIST_SHEETS)) {
            const sheet = wb.worksheets.find((w) => norm(w.name) === norm(def.sheet));
            if (!sheet) continue;
            const cols = {};
            sheet.getRow(1).eachCell((cell, col) => { cols[norm(cellText(cell.value))] = col; });
            if (!cols[norm(EMAIL_COLUMN)]) continue;
            sheet.eachRow((row, n) => {
                if (n === 1) return;
                const mail = cellText(row.getCell(cols[norm(EMAIL_COLUMN)]).value).toLowerCase();
                if (!mail) return;
                const item = {};
                for (const [key, title] of def.columns) item[key] = cols[norm(title)] ? cellText(row.getCell(cols[norm(title)]).value) : '';
                if (!Object.values(item).some(Boolean)) return;
                if (def.columns.some(([k]) => k === 'contact')) item.contact = item.contact.replace(/\s+/g, '');
                if (item.dependent) item.dependent = pick(['Dependent', 'Non-Dependent'], item.dependent);
                if (item.nominee) item.nominee = pick(['Yes', 'No'], item.nominee);
                if (item.gender) item.gender = pick(GENDERS, item.gender);
                listRows[listKey].set(mail, [...(listRows[listKey].get(mail) || []), item]);
            });
        }

        // Managers in this company, looked up by email
        const managers = await prisma.user.findMany({
            where: { companyId: admin.companyId, role: { in: ['TEAM_LEAD', 'MANAGER', 'ADMIN'] } },
            select: { id: true, email: true },
        });
        const managerByEmail = new Map(managers.map((m) => [m.email.toLowerCase(), m.id]));

        const results = [];
        for (const { rowNumber, data } of rows) {
            const email = data.email.toLowerCase();
            try {
                const parts = data.fullName.trim().split(/\s+/).filter(Boolean);
                const managerEmail = data.managerEmail.toLowerCase();
                const managerId = managerByEmail.get(managerEmail);
                if (!managerId) throw new Error(`Manager not found: ${data.managerEmail || '(blank)'}`);
                const role = data.role ? data.role.trim().toUpperCase().replace(/[\s-]+/g, '_') : 'EMPLOYEE';
                const password = DEFAULT_TEMP_PASSWORD; // same first password for everyone

                const payload = {
                    firstName: parts[0] || '',
                    lastName: parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '',
                    email,
                    password,
                    role,
                    managerId,
                    managerEmail,
                    jobPosition: data.jobPosition,
                    department: data.department,
                    dateOfJoining: data.dateOfJoining,
                    biometricId: data.biometricId,
                    phone: data.phone.replace(/\s+/g, ''),
                    dateOfBirth: data.dateOfBirth || undefined,
                    gender: data.gender ? pick(GENDERS, data.gender) : undefined,
                    maritalStatus: data.maritalStatus || undefined,
                    nationality: data.nationality || undefined,
                    residingAddress: data.residingAddress || undefined,
                    parentName: data.parentName || undefined,
                    parentPhone: data.parentPhone.replace(/\s+/g, '') || undefined,
                    workLocation: data.workLocation || undefined,
                    personalEmail: data.personalEmail || undefined,
                    details: {
                        divisionSection: data.divisionSection,
                        employmentStatus: pick(STATUS, data.employmentStatus || 'Active'),
                        city: data.city,
                        permanentAddress: data.permanentAddress,
                        alternateMobile: data.alternateMobile,
                        bloodGroup: data.bloodGroup ? pick(BLOOD, data.bloodGroup) : '',
                        emergencyContactName: data.emergencyContactName,
                        emergencyContactNumber: data.emergencyContactNumber,
                        emergencyContactRelation: data.emergencyContactRelation,
                        uanNumber: data.uanNumber,
                        pfNumber: data.pfNumber,
                        dojInPf: data.dojInPf,
                        dol: data.dol,
                        rol: data.rol,
                        probationStatus: data.probationStatus ? pick(PROBATION, data.probationStatus) : '',
                        dateOfConfirmation: data.dateOfConfirmation,
                        esicNumber: data.esicNumber,
                        familyMembers: listRows.familyMembers.get(email) || [],
                        education: listRows.education.get(email) || [],
                        experience: listRows.experience.get(email) || [],
                        sensitive: {
                            cubAccountNumber: data.cubAccountNumber,
                            personalBankAccount: data.personalBankAccount,
                            ifscCode: data.ifscCode,
                            bankName: data.bankName,
                            salary: data.salary,
                            panNo: data.panNo,
                            aadhaarNo: data.aadhaarNo,
                        },
                    },
                };

                // Same validation and creation as the single "Add Employee" form
                const res = await createEmployee(
                    new Request('http://localhost/api/admin/employees', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    })
                );
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed');
                results.push({ row: rowNumber, name: data.fullName, email, ok: true, employeeId: json.employee?.employeeId, password });
            } catch (err) {
                results.push({ row: rowNumber, name: data.fullName, email, ok: false, error: err.message });
            }
        }

        const created = results.filter((r) => r.ok).length;
        return NextResponse.json({ created, failed: results.length - created, results }, { status: 200 });
    } catch (error) {
        const [body, status] = errorResponseParts(error, 'Bulk upload failed');
        return NextResponse.json(body, { status });
    }
}
