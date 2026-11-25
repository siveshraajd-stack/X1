import { AddEmployeeForm } from '@/components/admin/add-employee-form';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { BulkUpload } from '@/components/admin/bulk-upload';

export const metadata = {
    title: 'Add New Employee - Keystone HR',
    description: 'Add a new employee to the system',
};

export default function AddEmployeePage() {
    return (
        <div className="min-h-screen text-gray-900 flex">
            <AdminSidebar />
            <main className="flex-1 ml-64 p-12">
                <div className="mb-12 border-l-8 border-gray-200 pl-8">
                    <h1 className="text-4xl font-bold text-gray-900 uppercase tracking-tight ">Add New Employee</h1>
                </div>
                <BulkUpload />
                <AddEmployeeForm />
            </main>
        </div>
    );
}
