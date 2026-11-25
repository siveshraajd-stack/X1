'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, Calendar, Clock, Award, Download, Plus } from 'lucide-react';
import { buildCsv, downloadCsv } from '@/lib/export-csv';
import { formatMinutes } from '@/lib/work-hours';

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('monthly');
  const [selectedModule, setSelectedModule] = useState('all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange, selectedModule]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/analytics?type=dashboard&period=${timeRange}`);
      const result = await response.json();
      setData(result.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Export everything shown on this page (plus every employee's hours and idle time) as one CSV file
  const exportData = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const [empRes, hoursRes] = await Promise.all([fetch('/api/admin/employees'), fetch('/api/admin/hours')]);
      const empData = await empRes.json().catch(() => ({}));
      const hoursData = await hoursRes.json().catch(() => ({}));
      const hours = hoursData.hours || {};
      const periodLabel = { weekly: 'Last Week', monthly: 'Last Month', quarterly: 'Last Quarter', yearly: 'Last Year' }[timeRange] || timeRange;

      const perDay = {};
      for (const record of data.attendance?.attendance || []) {
        const date = new Date(record.date).toLocaleDateString('en-IN');
        const status = String(record.status).toUpperCase();
        perDay[date] = perDay[date] || { present: 0, absent: 0 };
        if (['PRESENT', 'LATE', 'WFH', 'OD'].includes(status)) perDay[date].present += 1;
        if (status === 'ABSENT') perDay[date].absent += 1;
      }

      const sections = [
        { title: 'Keystone HR - Analytics Export', rows: [['Period', periodLabel], ['Exported on', new Date().toLocaleString('en-IN')]] },
        {
          title: 'Summary',
          columns: ['Metric', 'Value'],
          rows: [
            ['Total employees', data.employees?.totalEmployees || 0],
            ['Attendance rate', `${data.attendance?.attendanceRate || 0}%`],
            ['Late marks (30 days)', data.attendance?.lateDays || 0],
            ['Leave requests', data.leave?.totalRequests || 0],
          ],
        },
        { title: 'Attendance by day', columns: ['Date', 'Present', 'Absent (LOP)'], rows: Object.entries(perDay).map(([d, v]) => [d, v.present, v.absent]) },
        { title: 'Leave by type (days)', columns: ['Leave type', 'Days'], rows: Object.entries(data.leave?.leaveByType || {}) },
        {
          title: 'Employees by department',
          columns: ['Department', 'Employees'],
          rows: (data.employees?.employeesByDepartment || []).map((d) => [d.department, d._count?.department ?? 0]),
        },
        {
          title: 'Employee hours and idle time',
          columns: ['Employee', 'Employee ID', 'Department', 'Position', 'Hours today', 'Hours this week', 'Hours this month', 'Idle today', 'Idle this month'],
          rows: (empData.employees || []).map((e) => [
            e.name,
            e.employeeId,
            e.jobDetails?.department || '',
            e.jobDetails?.jobPosition || '',
            formatMinutes(hours[e.id]?.todayMinutes),
            formatMinutes(hours[e.id]?.weekMinutes),
            formatMinutes(hours[e.id]?.monthMinutes),
            formatMinutes(hours[e.id]?.todayIdleMinutes),
            formatMinutes(hours[e.id]?.monthIdleMinutes),
          ]),
        },
      ];
      downloadCsv(`hr-analytics-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(sections));
    } catch (error) {
      console.error('Export failed:', error);
      window.alert('Could not export the data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, trend, color = 'blue' }) => {
    const colorClasses = {
      blue: 'bg-primary-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-400',
      purple: 'bg-primary-500'
    };

    return (
      <div className="border border-gray-200 bg-white shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-1">{title}</p>
            <p className="text-3xl font-bold text-gray-900 uppercase">{value}</p>
            {trend && (
              <p className={`text-[8px] font-bold mt-2 uppercase tracking-wide ${trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {trend > 0 ? '+' : ''}{trend}% FROM_LAST_PERIOD
              </p>
            )}
          </div>
          <div className={`p-3 border border-gray-200 ${colorClasses[color] || colorClasses.blue} text-white`}>
            {Icon && <Icon className="w-6 h-6" />}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block w-12 h-12 border border-gray-200 border-t-transparent rounded-full animate-spin"></div>
        <p className="ml-4 text-gray-600 font-bold uppercase tracking-wide">Loading...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 font-bold uppercase tracking-wide">No data</p>
      </div>
    );
  }

  // Prepare chart data
  const attendanceData = data.attendance?.attendance ? 
    data.attendance.attendance.reduce((acc, record) => {
      const date = new Date(record.date).toLocaleDateString();
      const existing = acc.find(item => item.date === date);
      if (existing) {
        existing.present += ['PRESENT', 'LATE', 'WFH', 'OD'].includes(String(record.status).toUpperCase()) ? 1 : 0;
        existing.absent += String(record.status).toUpperCase() === 'ABSENT' ? 1 : 0;
      } else {
        acc.push({
          date,
          present: ['PRESENT', 'LATE', 'WFH', 'OD'].includes(String(record.status).toUpperCase()) ? 1 : 0,
          absent: String(record.status).toUpperCase() === 'ABSENT' ? 1 : 0
        });
      }
      return acc;
    }, []).slice(-7) : [];

  const leaveTypeData = data.leave?.leaveByType ? 
    Object.entries(data.leave.leaveByType).map(([type, days]) => ({
      name: type,
      value: days
    })) : [];

  const departmentData = data.employees?.employeesByDepartment ?
    data.employees.employeesByDepartment.map(item => ({
      name: item.department,
      employees: item._count.department
    })) : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 uppercase tracking-tight underline underline-offset-8 decoration-4 decoration-primary-500">Analytics Management</h1>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-6 py-3 border border-gray-200 text-[10px] font-bold uppercase tracking-wide bg-white outline-none cursor-pointer "
          >
            <option value="weekly">Last Week</option>
            <option value="monthly">Last Month</option>
            <option value="quarterly">Last Quarter</option>
            <option value="yearly">Last Year</option>
          </select>
          <button
            type="button"
            onClick={exportData}
            disabled={exporting}
            className="flex items-center gap-3 px-10 py-4 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wider border border-gray-200 shadow-sm hover:shadow-none transition-all active:translate-x-1 active:translate-y-1 disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            <span>{exporting ? 'Exporting...' : 'Export Data'}</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="TOTAL_EMPLOYEES"
          value={data.employees?.totalEmployees || 0}
          icon={Users}
          trend={5.2}
          color="blue"
        />
        <StatCard
          title="ATTENDANCE_RATE"
          value={`${data.attendance?.attendanceRate || 0}%`}
          icon={Calendar}
          trend={2.1}
          color="green"
        />
        <StatCard
          title="LATE_MARKS_30D"
          value={data.attendance?.lateDays || 0}
          icon={Clock}
          trend={0}
          color="yellow"
        />
        <StatCard
          title="LEAVE_REQUESTS"
          value={data.leave?.totalRequests || 0}
          icon={Award}
          trend={-3.2}
          color="purple"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Attendance Trends */}
        <div className="border border-gray-200 bg-white shadow-sm p-8">
          <h3 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-wider ">Attendance Trends Analysis</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#000" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold' }} />
              <Tooltip 
                contentStyle={{ 
                  border: '2px solid black', 
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }} 
              />
              <Legend />
              <Line type="monotone" dataKey="present" stroke="#10B981" strokeWidth={3} name="PRESENT" />
              <Line type="monotone" dataKey="absent" stroke="#EF4444" strokeWidth={3} name="ABSENT" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Leave Distribution */}
        <div className="border border-gray-200 bg-white shadow-sm p-8">
          <h3 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-wider ">Leave Distribution Metrics</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={leaveTypeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {leaveTypeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  border: '2px solid black', 
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }} 
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Department Distribution */}
        <div className="border border-gray-200 bg-white shadow-sm p-8">
          <h3 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-wider ">Department Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={departmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#000" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold' }} />
              <YAxis tick={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold' }} />
              <Tooltip 
                contentStyle={{ 
                  border: '2px solid black', 
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }} 
              />
              <Bar dataKey="employees" fill="#4F46E5" stroke="#000" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Overview */}
        <div className="border border-gray-200 bg-white shadow-sm p-8">
          <h3 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-wider ">Performance Overview</h3>
          {data.performance?.averageRatings && Object.keys(data.performance.averageRatings).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(data.performance.averageRatings).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-900 uppercase tracking-wide ">
                    {key.replace(/([A-Z])/g, ' $1').trim()}_RATING
                  </span>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-gray-200 border border-gray-200 h-4">
                      <div
                        className="bg-primary-600 h-2 mt-0.5"
                        style={{ width: `${(value / 5) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] font-bold text-gray-900 uppercase">
                      {value?.toFixed(1) || '0.0'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 font-bold uppercase tracking-wide mb-4">No Performance Reviews Found</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="border border-gray-200 bg-white shadow-sm">
        <div className="p-6 border-b-2 border-gray-200">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ">Recent Activity Log</h3>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            {data.employees?.recentEmployees?.slice(0, 5).map((employee) => (
              <div key={employee.id} className="flex items-center justify-between border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-gray-200 bg-primary-500 flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-900 uppercase tracking-wide">{employee.name}</p>
                    <p className="text-[8px] text-gray-500 uppercase tracking-wide mt-1">
                      {employee.jobDetails?.jobPosition} • JOINED {new Date(employee.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 text-[8px] font-bold uppercase tracking-wide border border-gray-200 bg-green-500 text-white">
                  NEW
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
