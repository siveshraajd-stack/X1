'use client';

/**
 * Big profile header shown first on every profile (HR, manager, team lead, employee):
 * photo, Employee Name (large), then Employee Code, Designation and Department.
 * `employee` = { name, employeeId, profile, jobDetails }.
 */
export function EmployeeHero({ employee, right = null }) {
    const job = employee.jobDetails || {};
    const picture = employee.profile?.profilePicture;
    const name = employee.name || '-';

    const fields = [
        { label: 'Employee Code', value: employee.employeeId },
        { label: 'Designation', value: job.jobPosition },
        { label: 'Department', value: job.department },
    ];

    return (
        <div className="relative border border-gray-200 bg-white shadow-sm rounded-3xl p-10 overflow-hidden">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-12">
                <div className="w-48 h-48 shrink-0 border border-gray-200 overflow-hidden shadow-sm bg-gray-100">
                    {picture ? (
                        <img src={picture} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl font-bold text-gray-300 uppercase">
                            {name.charAt(0)}
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0 text-center md:text-left space-y-6">
                    <div>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-2">Employee Name</p>
                        <h1 className="text-5xl font-bold text-gray-900 uppercase tracking-wide leading-none break-words">{name}</h1>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-5 pt-2">
                        {fields.map((f) => (
                            <div key={f.label} className="border-l-2 border-gray-200 pl-4 min-w-0 text-left">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">{f.label}</p>
                                <p className="text-sm font-bold text-gray-900 uppercase break-words">{f.value || 'N/A'}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {right}
            </div>
        </div>
    );
}
