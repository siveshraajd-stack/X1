const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Midnight Asia/Kolkata of the day that is `daysAgo` days before today (matches lib/dates.js)
const IST = 330 * 60 * 1000;
function istMidnight(daysAgo = 0) {
  const shifted = new Date(Date.now() + IST - daysAgo * 86400000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST);
}
function istTime(midnight, hour, minute) {
  return new Date(midnight.getTime() + (hour * 60 + minute) * 60000);
}

// Same AES-256-GCM format as lib/password-vault.js (so HR can see the demo passwords)
function encryptSecret(plain) {
  const secret = process.env.PASSWORD_VAULT_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

async function main() {
  console.log('🌱 Starting database seeding...');
  const today = new Date();
  const currentYear = today.getFullYear();

  // Create company
  const company = await prisma.company.create({
    data: {
      name: 'Keystone Technologies',
      logo: '/logo.png'
    }
  });
  console.log('✅ Company created:', company.name);

  // Create users with different roles
  const adminPassword = await bcrypt.hash('admin123', 10);
  const hrPassword = await bcrypt.hash('Hr123@', 10);
  const managerPassword = await bcrypt.hash('Manager123@', 10);
  const employeePassword = await bcrypt.hash('Emp123@', 10);

  const admin = await prisma.user.create({
    data: {
      employeeId: 'EMP2024001',
      email: 'admin@keystone.com',
      password: adminPassword,
      name: 'Admin User',
      phone: '+1234567890',
      role: 'ADMIN',
      companyId: company.id,
      mustChangePassword: false,
      emailVerified: true
    }
  });

  const hr = await prisma.user.create({
    data: {
      employeeId: 'EMP2024002',
      email: 'hr@kaspl.net',
      password: hrPassword,
      name: 'HR Manager',
      phone: '+1234567891',
      role: 'ADMIN',
      companyId: company.id,
      mustChangePassword: false,
      emailVerified: true
    }
  });

  // Manager reports to HR; Team Lead reports to the Manager; John reports to the Team Lead
  const employee2 = await prisma.user.create({
    data: {
      employeeId: 'EMP2024004',
      email: 'manager@kaspl.net',
      password: managerPassword,
      name: 'Manager',
      phone: '+1234567893',
      role: 'MANAGER',
      companyId: company.id,
      managerId: hr.id,
      managerEmail: hr.email,
      emailVerified: true
    }
  });

  // Team lead sits between the employee and the manager: John -> Team Lead -> Manager -> HR
  const teamLead = await prisma.user.create({
    data: {
      employeeId: 'EMP2024005',
      email: 'teamlead@kaspl.net',
      password: managerPassword,
      name: 'Team Lead',
      phone: '+1234567894',
      role: 'TEAM_LEAD',
      companyId: company.id,
      managerId: employee2.id,
      managerEmail: employee2.email,
      emailVerified: true
    }
  });

  const employee1 = await prisma.user.create({
    data: {
      employeeId: 'EMP2024003',
      email: 'employee@kaspl.net',
      password: employeePassword,
      name: 'John Doe',
      phone: '+1234567892',
      role: 'EMPLOYEE',
      companyId: company.id,
      managerId: teamLead.id,
      managerEmail: teamLead.email,
      emailVerified: true
    }
  });

  const vaultRows = [
    [hr, 'Hr123@'],
    [employee2, 'Manager123@'],
    [teamLead, 'Manager123@'],
    [employee1, 'Emp123@'],
  ]
    .map(([u, pw]) => ({ userId: u.id, encrypted: encryptSecret(pw) }))
    .filter((r) => r.encrypted);
  if (vaultRows.length) {
    await prisma.passwordVault.createMany({ data: vaultRows });
  }

  console.log('✅ Users created');

  // Create employee profiles
  await prisma.employeeProfile.createMany({
    data: [
      {
        userId: employee1.id,
        dateOfBirth: new Date('1990-01-15'),
        gender: 'Male',
        maritalStatus: 'Single',
        nationality: 'US',
        personalEmail: 'john.doe.personal@gmail.com',
        residingAddress: '123 Main St, New York, NY 10001',
        about: 'Experienced software developer with expertise in web technologies.',
        jobLoves: 'Problem solving and creating innovative solutions',
        interestsHobbies: 'Coding, reading, and hiking'
      },
      {
        userId: employee2.id,
        dateOfBirth: new Date('1992-05-20'),
        gender: 'Female',
        maritalStatus: 'Married',
        nationality: 'US',
        personalEmail: 'jane.smith.personal@gmail.com',
        residingAddress: '456 Oak Ave, Los Angeles, CA 90001',
        about: 'HR professional with experience in talent management.',
        jobLoves: 'Helping people grow and develop their careers',
        interestsHobbies: 'Yoga, cooking, and travel'
      }
    ]
  });

  // Create job details
  await prisma.jobDetails.createMany({
    data: [
      {
        userId: employee1.id,
        jobPosition: 'Senior Software Engineer',
        department: 'Engineering',
        manager: employee2.name,
        workLocation: 'New York Office',
        dateOfJoining: new Date('2022-01-15')
      },
      {
        userId: employee2.id,
        jobPosition: 'HR Specialist',
        department: 'Human Resources',
        manager: hr.name,
        workLocation: 'Los Angeles Office',
        dateOfJoining: new Date('2021-06-01')
      }
    ]
  });

  // Create attendance records for the last 30 days (midnight IST, one row per user per day)
  const attendanceRecords = [];
  const weekend = (d) => {
    const dow = new Date(d.getTime() + IST).getUTCDay();
    return dow === 0 || dow === 6;
  };

  for (let i = 1; i <= 30; i++) {
    const day = istMidnight(i);
    if (weekend(day)) continue;

    // John: on time most days, a few late marks
    const johnLate = i % 7 === 0;
    attendanceRecords.push({
      userId: employee1.id,
      date: day,
      checkIn: istTime(day, johnLate ? 9 : 8, johnLate ? 25 : 55),
      checkOut: istTime(day, 18, 0),
      status: johnLate ? 'LATE' : 'PRESENT'
    });

    // Jane: mix of present, WFH, on duty and an absence
    if (i % 10 === 0) {
      attendanceRecords.push({ userId: employee2.id, date: day, status: 'ABSENT' });
    } else {
      const status = i % 5 === 0 ? 'WFH' : i % 4 === 0 ? 'OD' : 'PRESENT';
      attendanceRecords.push({
        userId: employee2.id,
        date: day,
        checkIn: istTime(day, 8, 50),
        checkOut: istTime(day, 17, 35),
        status
      });
    }
  }

  await prisma.attendance.createMany({ data: attendanceRecords, skipDuplicates: true });

  // Create leave requests (assigned to the team lead first, then the manager above, then HR)
  await prisma.leaveRequest.createMany({
    data: [
      {
        userId: employee1.id,
        managerId: teamLead.id,
        upperManagerId: employee2.id,
        type: 'CASUAL',
        startDate: istMidnight(-8),
        endDate: istMidnight(-9),
        days: 2,
        status: 'PENDING',
        reason: 'Family vacation'
      },
      {
        userId: employee2.id,
        managerId: hr.id,
        type: 'SICK',
        startDate: istMidnight(5),
        endDate: istMidnight(5),
        days: 1,
        status: 'APPROVED',
        reason: 'Medical appointment',
        adminComment: 'Approved'
      }
    ]
  });

  // Holidays: fixed-date national holidays for this and next year
  const year = new Date().getFullYear();
  const fixed = [['01-01', "New Year's Day"], ['01-26', 'Republic Day'], ['05-01', 'Labour Day'], ['08-15', 'Independence Day'], ['10-02', 'Gandhi Jayanti'], ['12-25', 'Christmas']];
  await prisma.holiday.createMany({
    data: [year, year + 1].flatMap((y) =>
      fixed.map(([md, name]) => ({
        companyId: company.id,
        date: new Date(Date.parse(`${y}-${md}T00:00:00+05:30`)),
        name
      }))
    ),
    skipDuplicates: true
  });

  // Create sample notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: employee1.id,
        type: 'LEAVE_UPDATE',
        title: 'Leave Request Submitted',
        message: 'Your leave request for 2 days has been submitted and is pending approval.',
        priority: 'NORMAL',
        category: 'SYSTEM'
      },
      {
        userId: employee2.id,
        type: 'SYSTEM',
        title: 'Welcome to Keystone',
        message: 'Mark your attendance daily. Reporting after 9:00 AM counts as late.',
        priority: 'HIGH',
        category: 'SYSTEM'
      },
      {
        userId: hr.id,
        type: 'LEAVE_PENDING',
        title: 'Leave Request Pending',
        message: 'John Doe has submitted a leave request for your approval.',
        priority: 'HIGH',
        category: 'EMAIL',
        actionUrl: '/admin/leave',
        actionText: 'Review Request'
      }
    ]
  });

  // Create performance reviews
  await prisma.performanceReview.createMany({
    data: [
      {
        userId: employee1.id,
        reviewPeriod: 'Q1-2024',
        reviewType: 'QUARTERLY',
        qualityRating: 4.5,
        quantityRating: 4.0,
        teamworkRating: 4.2,
        initiativeRating: 4.3,
        attendanceRating: 4.8,
        overallRating: 4.36,
        strengths: 'Excellent problem-solving skills, strong technical knowledge',
        weaknesses: 'Could improve in documentation',
        goals: 'Complete 3 certifications, mentor junior developers',
        recommendations: 'Focus on leadership skills',
        status: 'APPROVED',
        reviewedBy: hr.id,
        reviewedAt: new Date()
      },
      {
        userId: employee2.id,
        reviewPeriod: 'Q1-2024',
        reviewType: 'QUARTERLY',
        qualityRating: 4.2,
        quantityRating: 4.5,
        teamworkRating: 4.8,
        initiativeRating: 4.0,
        attendanceRating: 4.5,
        overallRating: 4.4,
        strengths: 'Great team player, excellent communication skills',
        weaknesses: 'Could be more proactive in process improvements',
        goals: 'Complete HR analytics course, improve recruitment process',
        recommendations: 'Take on more strategic initiatives',
        status: 'APPROVED',
        reviewedBy: hr.id,
        reviewedAt: new Date()
      }
    ]
  });

  // Create training programs
  const training1 = await prisma.training.create({
    data: {
      title: 'Advanced JavaScript Concepts',
      description: 'Deep dive into advanced JavaScript patterns and best practices',
      category: 'TECHNICAL',
      duration: 40,
      cost: 500,
      instructor: 'John Smith',
      startDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000),
      status: 'PLANNED'
    }
  });

  const training2 = await prisma.training.create({
    data: {
      title: 'Leadership Excellence',
      description: 'Develop essential leadership skills for career growth',
      category: 'SOFT_SKILLS',
      duration: 24,
      cost: 750,
      instructor: 'Sarah Johnson',
      startDate: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000),
      endDate: new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000),
      status: 'PLANNED'
    }
  });

  // Create training enrollments
  await prisma.trainingEnrollment.createMany({
    data: [
      {
        userId: employee1.id,
        trainingId: training1.id,
        status: 'ENROLLED',
        progress: 0
      },
      {
        userId: employee1.id,
        trainingId: training2.id,
        status: 'ENROLLED',
        progress: 0
      },
      {
        userId: employee2.id,
        trainingId: training2.id,
        status: 'ENROLLED',
        progress: 0
      }
    ]
  });

  // Create job postings
  await prisma.jobPosting.createMany({
    data: [
      {
        title: 'Senior Frontend Developer',
        description: 'We are looking for an experienced frontend developer to join our engineering team.',
        department: 'Engineering',
        location: 'New York',
        employmentType: 'FULL_TIME',
        experienceLevel: 'SENIOR',
        salaryRange: '$80,000 - $120,000',
        status: 'ACTIVE',
        postedBy: hr.id,
        deadline: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        title: 'HR Coordinator',
        description: 'Seeking an HR coordinator to support our growing team.',
        department: 'Human Resources',
        location: 'Los Angeles',
        employmentType: 'FULL_TIME',
        experienceLevel: 'ENTRY',
        salaryRange: '$45,000 - $65,000',
        status: 'ACTIVE',
        postedBy: hr.id,
        deadline: new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000)
      }
    ]
  });

  // Create sample job applications
  const jobPostings = await prisma.jobPosting.findMany();
  
  await prisma.jobApplication.createMany({
    data: [
      {
        jobPostingId: jobPostings[0].id,
        name: 'Michael Brown',
        email: 'michael.brown@email.com',
        phone: '+1234567894',
        resumeUrl: '/resumes/michael_brown.pdf',
        coverLetter: 'Experienced frontend developer with 5+ years of experience...',
        status: 'SCREENING'
      },
      {
        jobPostingId: jobPostings[1].id,
        name: 'Emily Davis',
        email: 'emily.davis@email.com',
        phone: '+1234567895',
        resumeUrl: '/resumes/emily_davis.pdf',
        coverLetter: 'Recent HR graduate looking for opportunities...',
        status: 'INTERVIEW'
      }
    ]
  });

  // Create audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: 'LOGIN',
        resource: 'USER',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      {
        userId: hr.id,
        action: 'CREATE',
        resource: 'LEAVE_REQUEST',
        resourceId: employee1.id,
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      {
        userId: employee1.id,
        action: 'VIEW',
        resource: 'ATTENDANCE',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    ]
  });

  // Create documents
  await prisma.document.createMany({
    data: [
      {
        userId: employee1.id,
        fileName: 'John_Doe_Resume.pdf',
        fileType: 'application/pdf',
        fileUrl: '/documents/john_doe_resume.pdf',
        documentType: 'Resume'
      },
      {
        userId: employee1.id,
        fileName: 'John_Doe_Certificate.pdf',
        fileType: 'application/pdf',
        fileUrl: '/documents/john_doe_certificate.pdf',
        documentType: 'Certificate'
      },
      {
        userId: employee2.id,
        fileName: 'Jane_Smith_Resume.pdf',
        fileType: 'application/pdf',
        fileUrl: '/documents/jane_smith_resume.pdf',
        documentType: 'Resume'
      },
      {
        userId: employee2.id,
        fileName: 'Jane_Smith_ID_Proof.pdf',
        fileType: 'application/pdf',
        fileUrl: '/documents/jane_smith_id_proof.pdf',
        documentType: 'ID Proof'
      }
    ]
  });

  // Create company settings
  await prisma.companySettings.create({
    data: {
      companyId: company.id,
      year: currentYear,
      lastSerialNumber: 4
    }
  });

  // Create reports
  await prisma.report.createMany({
    data: [
      {
        name: 'Monthly Attendance Report - June 2024',
        type: 'ATTENDANCE',
        parameters: JSON.stringify({ month: 6, year: 2024 }),
        format: 'PDF',
        status: 'COMPLETED',
        generatedBy: hr.id,
        fileUrl: '/reports/attendance_june_2024.pdf',
        fileSize: 1024000
      },
      {
        name: 'Quarterly Leave Report - Q2 2024',
        type: 'LEAVE',
        parameters: JSON.stringify({ quarter: 2, year: 2024 }),
        format: 'EXCEL',
        status: 'COMPLETED',
        generatedBy: hr.id,
        fileUrl: '/reports/leave_q2_2024.xlsx',
        fileSize: 512000
      }
    ]
  });

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📧 Login Credentials:');
  console.log('HR: hr@kaspl.net / Hr123@');
  console.log('Manager: manager@kaspl.net / Manager123@');
  console.log('Team Lead: teamlead@kaspl.net / Manager123@');
  console.log('Employee: employee@kaspl.net / Emp123@ (any name@kaspl.net works with Emp123@)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
