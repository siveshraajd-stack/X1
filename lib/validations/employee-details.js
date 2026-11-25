import { z } from 'zod';

// Extra employee details: personal, emergency contact, family, PF, academic, experience,
// bank / PAN / Aadhaar (confidential) and uploaded documents.
// Every field is optional so HR can fill what they have now and the rest later.

const text = (max = 200) => z.string().trim().max(max, `Value is too long (max ${max} characters)`).optional();
const date = (label) =>
    z
        .string()
        .trim()
        .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), `${label} is not a valid date`)
        .optional();
// Cleans the text first (trim, remove spaces / dashes, upper case) and then checks the pattern. '' means "empty".
const pattern = (re, message, { upper = false, strip = false } = {}) =>
    z
        .string()
        .transform((s) => {
            let v = s.trim();
            if (strip) v = v.replace(/[\s-]/g, '');
            if (upper) v = v.toUpperCase();
            return v;
        })
        .pipe(z.union([z.literal(''), z.string().regex(re, message)]))
        .optional();

const phone10 = (label) => pattern(/^[0-9]{10}$/, `${label} must be 10 digits`, { strip: true });

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const DOCUMENT_TYPES = [
    'PAN Document',
    'Aadhaar Document',
    'Educational Certificates',
    'Experience Certificates',
    'Bank Proof',
    'Other Supporting Documents',
];

export const familyMemberSchema = z.object({
    name: z.string().trim().min(1, 'Family member name is required').max(100),
    relationship: text(50),
    dob: date('Family member date of birth'),
    gender: text(20),
    occupation: text(100),
    contact: phone10('Family member contact number'),
    dependent: z.enum(['Dependent', 'Non-Dependent', '']).optional(),
    nominee: z.enum(['Yes', 'No', '']).optional(),
});

export const educationSchema = z.object({
    qualification: z.string().trim().min(1, 'Qualification is required for every academic row').max(100),
    course: text(100),
    specialization: text(100),
    institution: text(150),
    yearOfPassing: pattern(/^(19|20)[0-9]{2}$/, 'Year of passing must be a 4 digit year'),
    percentage: text(20),
    additionalQualification: text(150),
    certification: text(150),
});

export const experienceSchema = z.object({
    company: z.string().trim().min(1, 'Previous company is required for every experience row').max(150),
    designation: text(100),
    department: text(100),
    dateOfJoining: date('Experience joining date'),
    dateOfLeaving: date('Experience leaving date'),
    totalExperience: text(50),
    reasonForLeaving: text(200),
});

export const sensitiveSchema = z.object({
    cubAccountNumber: pattern(/^[0-9]{9,18}$/, 'CUB account number must be 9 to 18 digits', { strip: true }),
    personalBankAccount: pattern(/^[0-9]{9,18}$/, 'Personal bank account number must be 9 to 18 digits', { strip: true }),
    ifscCode: pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC code is not valid (example: CIUB0000123)', { strip: true, upper: true }),
    bankName: text(100),
    salary: pattern(/^[0-9]+(\.[0-9]{1,2})?$/, 'Salary must be a number', { strip: true }),
    panNo: pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN number is not valid (example: ABCDE1234F)', { strip: true, upper: true }),
    aadhaarNo: pattern(/^[0-9]{12}$/, 'Aadhaar number must be 12 digits', { strip: true }),
});

export const documentSchema = z.object({
    documentType: z.enum(DOCUMENT_TYPES),
    fileName: z.string().trim().min(1).max(200),
    // Only files uploaded through our own upload endpoint are accepted
    fileUrl: z.string().regex(/^\/uploads\/documents\/[A-Za-z0-9-]+\.(pdf|png|jpg|webp|gif)$/, 'Document file is not valid'),
});

export const detailsSchema = z.object({
    // 1. Personal details
    divisionSection: text(100),
    employmentStatus: z.enum(['Active', 'Inactive', 'On Notice', 'Resigned', 'Terminated', '']).optional(),
    city: text(100),
    permanentAddress: text(500),
    alternateMobile: phone10('Alternate mobile number'),
    bloodGroup: z.enum([...BLOOD_GROUPS, '']).optional(),
    emergencyContactName: text(100),
    emergencyContactNumber: phone10('Emergency contact number'),
    emergencyContactRelation: text(50),

    // 2. Family, 4. Academic, 5. Experience
    familyMembers: z.array(familyMemberSchema).max(20, 'Too many family members').optional(),
    education: z.array(educationSchema).max(20, 'Too many academic rows').optional(),
    experience: z.array(experienceSchema).max(20, 'Too many experience rows').optional(),

    // 3. PF details
    uanNumber: pattern(/^[0-9]{12}$/, 'UAN number must be 12 digits', { strip: true }),
    pfNumber: text(40),
    dojInPf: date('DOJ in PF'),
    dol: date('Date of leaving'),
    rol: text(200),
    probationStatus: z.enum(['Probation', 'Confirmed', '']).optional(),
    dateOfConfirmation: date('Date of confirmation'),
    esicNumber: text(20),

    // 6. Bank details + 7. PAN / Aadhaar (stored encrypted, shown hidden)
    sensitive: sensitiveSchema.optional(),

    // 7. Documents: new uploads, and ids of existing documents to remove
    documents: z.array(documentSchema).max(30, 'Too many documents').optional(),
    removeDocumentIds: z.array(z.string().min(1)).max(50).optional(),
});
