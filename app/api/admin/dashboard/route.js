import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { dayStart } from '@/lib/dates';

export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const companyId = session.user.companyId;

        if (!companyId) {
            return NextResponse.json(
                { error: 'Company not found' },
                { status: 400 }
            );
        }

        // Same people the HR employee list shows
        const staffWhere = { companyId, role: { in: ['EMPLOYEE', 'TEAM_LEAD', 'MANAGER'] } };

        const totalEmployees = await prisma.user.count({ where: staffWhere });

        const recentEmployees = await prisma.user.findMany({
            where: staffWhere,
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, name: true, email: true, employeeId: true, createdAt: true },
        });

        // "Today" is the Indian calendar day (midnight IST to midnight IST)
        const startOfToday = dayStart(new Date());
        const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

        const todayRows = await prisma.attendance.findMany({
            where: { user: staffWhere, date: { gte: startOfToday, lte: endOfToday } },
            select: { userId: true, status: true, checkIn: true, clockIn: true },
        });
        // On duty = marked OD today (an approved OD claim). OD is its own state: never Present / Late / Absent.
        const onDutyIds = new Set(todayRows.filter((r) => String(r.status || '').toUpperCase() === 'OD').map((r) => r.userId));
        const onDuty = onDutyIds.size;

        // Work from home = marked WFH today (an approved WFH request, or chosen by the employee). Its own state too.
        const wfhIds = new Set(
            todayRows.filter((r) => String(r.status || '').toUpperCase() === 'WFH' && !onDutyIds.has(r.userId)).map((r) => r.userId)
        );
        const workFromHome = wfhIds.size;

        // Present = staff who clocked in on the website or checked in on the biometric machine today (not on duty / WFH)
        const presentIds = new Set(
            todayRows
                .filter((r) => (r.checkIn || r.clockIn) && !onDutyIds.has(r.userId) && !wfhIds.has(r.userId))
                .map((r) => r.userId)
        );
        const presentToday = presentIds.size;

        // On leave = staff with approved leave today (someone who is present or on duty is not counted twice)
        const leaveRows = await prisma.leaveRequest.findMany({
            where: {
                user: staffWhere,
                startDate: { lte: endOfToday },
                endDate: { gte: startOfToday },
                status: 'APPROVED',
            },
            select: { userId: true, type: true },
        });
        // Approved Work From Home is not leave
        const onLeave = new Set(
            leaveRows
                .filter((r) => !['WFH', 'OD'].includes(r.type))
                .map((r) => r.userId)
                .filter((id) => !presentIds.has(id) && !onDutyIds.has(id) && !wfhIds.has(id))
        ).size;

        const pendingLeaves = await prisma.leaveRequest.count({
            where: { user: staffWhere, status: 'MANAGER_APPROVED' }, // waiting for HR's final decision
        });

        const absentCount = totalEmployees - presentToday - onLeave - onDuty - workFromHome;

        return NextResponse.json({
            stats: {
                totalEmployees,
                presentToday,
                onLeave,
                onDuty,
                workFromHome,
                pendingLeaves,
                absentToday: absentCount > 0 ? absentCount : 0,
            },
            recentEmployees,
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        return NextResponse.json(
            { error: 'An error occurred while fetching dashboard data' },
            { status: 500 }
        );
    }
}

