import { SignupForm } from '@/components/auth/signup-form';

export const metadata = {
    title: 'Register - Keystone HR',
    description: 'Create your HR account',
};

export default function RegisterPage() {
    return (
        <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center p-4">

            <div className="w-full max-w-2xl relative z-10">
                {/* Logo and Branding */}
                <div className="mb-8 text-center">
                    <div className="inline-block border border-gray-200 p-3 mb-2 bg-white shadow-sm">
                        <h1 className="text-3xl font-bold text-gray-900 tracking-wide uppercase">Keystone Hr</h1>
                        <p className="text-xs font-bold text-primary-700 mt-1">Growing to Serve. Serving to Grow</p>
                    </div>
                </div>

                {/* Register Box */}
                <div className="bg-white border border-gray-200 p-10 shadow-sm relative">
                    <div className="absolute -top-4 -left-4 bg-primary-600 text-white px-4 py-1 text-[10px] font-bold uppercase tracking-wide border border-gray-200">
                        PROTOCOL:ENTITY_CREATION
                    </div>

                    <div className="mb-10 border-b-2 border-gray-200 pb-6">
                        <h2 className="text-3xl font-bold text-gray-900 uppercase leading-none mb-2">Initialize Hr Account</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ">Register corporate entity and administrative credentials</p>
                    </div>

                    <SignupForm />
                </div>
            </div>
        </div>
    );
}
