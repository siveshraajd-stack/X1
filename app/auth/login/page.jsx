import { LoginForm } from '@/components/auth/login-form';

export const metadata = {
    title: 'Sign In - Keystone HR',
    description: 'Sign in to your Keystone account',
};

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center p-4">

            <div className="w-full max-w-md relative z-10">
                {/* Logo and Branding */}
                <div className="mb-10 text-center">
                    <img src="/logo.png" alt="Keystone" className="w-16 h-16 mx-auto mb-3 object-contain" />
                    <h1 className="text-4xl font-bold text-primary-800 tracking-tight">Keystone</h1>
                    <p className="text-xs font-bold text-primary-700 mb-1">Growing to Serve. Serving to Grow</p>
                </div>

                {/* Login Card - Replaced with Lined Box */}
                <div className="bg-white border border-gray-200 p-8 shadow-sm relative">
                    <div className="absolute -top-4 -left-4 bg-primary-700 text-white px-4 py-1 text-[10px] font-bold uppercase tracking-wide ">
                        ACCESS_TERMINAL
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 uppercase leading-none mb-2">Sign In</h2>
                    </div>

                    <LoginForm />
                </div>
            </div>
        </div>
    );
}
