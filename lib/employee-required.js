// Every detail HR must fill when a new account (employee / team lead / manager) is created.
// Used by the Add Employee form (browser) and by POST /api/admin/employees (server).
// Not required for a new joiner: DOL / ROL (date / reason of leaving), date of confirmation unless
// "Confirmed", biometric ID, and experience rows (freshers); but every experience row that is added must be complete.

const blank = (v) => String(v ?? '').trim() === '';

const FORM_FIELDS = [
    ['name', 'Employee name'],
    ['jobPosition', 'Designation'],
    ['department', 'Department'],
    ['residingAddress', 'Correspondence address'],
    ['phone', 'Mobile number'],
    ['email', 'Official mail ID'],
    ['personalEmail', 'Personal e-mail ID'],
    ['dateOfBirth', 'DOB'],
    ['gender', 'Gender'],
    ['maritalStatus', 'Marital status'],
    ['dateOfJoining', 'DOJ'],
    ['managerId', 'Manager'],
    ['managerEmail', 'Manager email'],
];

const DETAIL_FIELDS = [
    ['divisionSection', 'Division / Section'],
    ['employmentStatus', 'Status'],
    ['city', 'City'],
    ['permanentAddress', 'Permanent address'],
    ['alternateMobile', 'Alternate mobile number'],
    ['bloodGroup', 'Blood group'],
    ['emergencyContactName', 'Emergency contact name'],
    ['emergencyContactNumber', 'Emergency contact number'],
    ['emergencyContactRelation', 'Emergency contact relation'],
    ['uanNumber', 'UAN number'],
    ['pfNumber', 'PF number'],
    ['dojInPf', 'DOJ in PF'],
    ['probationStatus', 'Probation / Confirmation'],
    ['esicNumber', 'ESIC number'],
];

const SENSITIVE_FIELDS = [
    ['cubAccountNumber', 'CUB account number'],
    ['personalBankAccount', 'Personal bank account'],
    ['ifscCode', 'IFSC code'],
    ['bankName', 'Bank name'],
    ['salary', 'Salary'],
    ['panNo', 'PAN number'],
    ['aadhaarNo', 'Aadhaar number'],
];

const FAMILY = [['name', 'Name'], ['relationship', 'Relationship'], ['dob', 'DOB'], ['gender', 'Gender'], ['occupation', 'Occupation'], ['contact', 'Contact number'], ['dependent', 'Dependent / Non-Dependent'], ['nominee', 'Nominee']];
const EDUCATION = [['qualification', 'Qualification'], ['course', 'Course / Degree'], ['specialization', 'Specialization'], ['institution', 'Institution / University'], ['yearOfPassing', 'Year of passing'], ['percentage', 'Percentage / CGPA'], ['additionalQualification', 'Additional qualification'], ['certification', 'Certification']];
const EXPERIENCE = [['company', 'Previous company'], ['designation', 'Designation'], ['department', 'Department'], ['dateOfJoining', 'Date of joining'], ['dateOfLeaving', 'Date of leaving'], ['totalExperience', 'Total experience'], ['reasonForLeaving', 'Reason for leaving']];

// Documents that must be uploaded
export const REQUIRED_DOCUMENTS = ['PAN Document', 'Aadhaar Document', 'Educational Certificates', 'Bank Proof'];

/**
 * @param {object} form    flat form values: name, jobPosition, department, residingAddress, phone, email, personalEmail,
 *                         dateOfBirth, gender, maritalStatus, dateOfJoining, managerId, managerEmail
 * @param {object} details the `details` object (extra fields, family / education / experience rows, sensitive, documents)
 * @returns {string} first problem found, or '' when everything is filled
 */
export function missingEmployeeDetails(form = {}, details = {}) {
    for (const [key, label] of FORM_FIELDS) {
        if (blank(form[key])) return `${label} is required`;
    }
    for (const [key, label] of DETAIL_FIELDS) {
        if (blank(details[key])) return `${label} is required`;
    }
    if (details.probationStatus === 'Confirmed' && blank(details.dateOfConfirmation)) return 'Date of confirmation is required';

    const sensitive = details.sensitive || {};
    for (const [key, label] of SENSITIVE_FIELDS) {
        if (blank(sensitive[key])) return `${label} is required`;
    }

    const rowsOf = (rows) => (Array.isArray(rows) ? rows : []);
    const checkRows = (rows, columns, name) => {
        for (let i = 0; i < rowsOf(rows).length; i++) {
            for (const [key, label] of columns) {
                if (blank(rows[i]?.[key])) return `${name} ${i + 1}: ${label} is required`;
            }
        }
        return '';
    };

    if (rowsOf(details.familyMembers).length === 0) return 'Add at least one family member';
    const family = checkRows(details.familyMembers, FAMILY, 'Family member');
    if (family) return family;

    if (rowsOf(details.education).length === 0) return 'Add at least one academic qualification';
    const education = checkRows(details.education, EDUCATION, 'Qualification');
    if (education) return education;

    const experience = checkRows(details.experience, EXPERIENCE, 'Experience');
    if (experience) return experience;

    const uploaded = new Set(rowsOf(details.documents).map((d) => d.documentType));
    for (const type of REQUIRED_DOCUMENTS) {
        if (!uploaded.has(type)) return `Please upload the document: ${type}`;
    }
    return '';
}
