'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { hrSignupSchema } from '@/lib/validations/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SignupForm() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const router = useRouter();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(hrSignupSchema),
    });

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const uploadLogo = async () => {
        if (!logoFile) return null;

        setUploadingLogo(true);
        const formData = new FormData();
        formData.append('file', logoFile);
        formData.append('type', 'logo');

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                return result.url;
            }
        } catch (error) {
            console.error('Logo upload error:', error);
        } finally {
            setUploadingLogo(false);
        }
        return null;
    };

    const onSubmit = async (data) => {
        setLoading(true);
        setError('');

        try {
            // Upload logo first if selected
            let logoUrl = null;
            if (logoFile) {
                logoUrl = await uploadLogo();
            }

            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...data,
                    companyLogo: logoUrl,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create account');
            }

            setSuccess(true);

            // Redirect to login after 2 seconds
            setTimeout(() => {
                router.push('/auth/login');
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="p-8 bg-primary-700 border border-gray-200 shadow-sm flex items-center gap-6">
                <div className="w-12 h-12 bg-green-500 flex items-center justify-center font-bold text-white text-2xl border border-gray-200">✓</div>
                <div>
                    <h3 className="text-xl font-bold text-white uppercase ">Protocol Complete</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide ">Entity registered. Relocating to access terminal...</p>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-12">
            {error && (
                <div className="p-4 bg-red-600 border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="w-6 h-6 bg-white flex items-center justify-center font-bold text-red-600 text-xs">!</div>
                    <p className="text-white text-[10px] font-bold uppercase tracking-wide ">VAL_PROTOCOL_ERROR: {error}</p>
                </div>
            )}

            {/* Company Information */}
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-2 h-6 bg-primary-700"></div>
                    <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider ">01 // CORPORATE_ENTITY_DATA</h3>
                </div>

                <div className="bg-gray-50 border border-gray-200 p-8 shadow-sm">
                    {/* Company Logo Upload */}
                    <div className="mb-8 border-b-2 border-solid border-gray-200 pb-8">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-4">
                            LOGO_ASSET_UPLOAD [OPTIONAL]
                        </label>
                        <div className="flex items-center gap-6">
                            {logoPreview ? (
                                <div className="w-20 h-20 border border-gray-200 bg-white overflow-hidden shadow-sm">
                                    <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                                </div>
                            ) : (
                                <div className="w-20 h-20 border border-solid border-gray-200 bg-white flex items-center justify-center opacity-30 shadow-sm">
                                    <svg className="w-8 h-8 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            )}
                            <div className="flex-1">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoChange}
                                    className="hidden"
                                    id="logo-upload"
                                />
                                <label
                                    htmlFor="logo-upload"
                                    className="inline-block px-4 py-2 bg-primary-700 text-white text-[10px] font-bold uppercase tracking-wide cursor-pointer hover:bg-white hover:text-gray-900 border border-gray-200 transition-all shadow-sm active:shadow-none "
                                >
                                    LOAD_IMAGE
                                </label>
                                <p className="text-[8px] font-bold text-gray-400 mt-2 uppercase">EXT: PNG/JPG | LIMIT: 2MB</p>
                            </div>
                        </div>
                    </div>

                    {/* Company Name */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">
                            OFFICIAL_ENTITY_NAME <span className="text-red-500">*</span>
                        </label>
                        <input
                            {...register('companyName')}
                            placeholder="CORPORATE_LEGAL_TITLE"
                            className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-white transition-all placeholder:text-gray-200 ${errors.companyName ? 'border-red-500 bg-red-50' : ''}`}
                        />
                        {errors.companyName && <p className="text-[8px] font-bold text-red-600 uppercase ">{errors.companyName.message}</p>}
                    </div>
                </div>
            </div>

            {/* HR User Information */}
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-2 h-6 bg-primary-600"></div>
                    <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider ">02 // ADMIN_USER_CREDENTIALS</h3>
                </div>

                <div className="grid grid-cols-2 gap-6 bg-white border border-gray-200 p-8 shadow-sm">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">FULL_NAME <span className="text-red-500">*</span></label>
                            <input
                                {...register('name')}
                                placeholder="IDENTIFIER"
                                className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200 ${errors.name ? 'border-red-500 bg-red-50' : ''}`}
                            />
                            {errors.name && <p className="text-[8px] font-bold text-red-600 uppercase ">{errors.name.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">EMAIL_ADDR <span className="text-red-500">*</span></label>
                            <input
                                {...register('email')}
                                type="email"
                                placeholder="DIGITAL_ADDRESS"
                                className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200 ${errors.email ? 'border-red-500 bg-red-50' : ''}`}
                            />
                            {errors.email && <p className="text-[8px] font-bold text-red-600 uppercase ">{errors.email.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">PHONE_NUM <span className="text-red-500">*</span></label>
                            <input
                                {...register('phone')}
                                placeholder="+91XXXXXXXXXX"
                                className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200 ${errors.phone ? 'border-red-500 bg-red-50' : ''}`}
                            />
                            {errors.phone && <p className="text-[8px] font-bold text-red-600 uppercase ">{errors.phone.message}</p>}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">SECURE_PASS <span className="text-red-500">*</span></label>
                            <input
                                {...register('password')}
                                type="password"
                                placeholder="••••••••"
                                className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200 ${errors.password ? 'border-red-500 bg-red-50' : ''}`}
                            />
                            {errors.password && <p className="text-[8px] font-bold text-red-600 uppercase ">{errors.password.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">CONFIRM_PASS <span className="text-red-500">*</span></label>
                            <input
                                {...register('confirmPassword')}
                                type="password"
                                placeholder="••••••••"
                                className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200 ${errors.confirmPassword ? 'border-red-500 bg-red-50' : ''}`}
                            />
                            {errors.confirmPassword && <p className="text-[8px] font-bold text-red-600 uppercase ">{errors.confirmPassword.message}</p>}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || uploadingLogo}
                            className="w-full bg-primary-700 text-white text-[10px] font-bold py-4 border-b-4 border-r-4 border-green-500 uppercase tracking-wider hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:translate-x-1 active:translate-y-1 shadow-sm disabled:opacity-50 mt-2"
                        >
                            {uploadingLogo ? 'LOAD_ASSET...' : loading ? 'EXECUTING...' : 'COMMIT_REGISTRATION'}
                        </button>
                    </div>
                </div>
            </div>

            <p className="text-[10px] font-bold text-gray-500 text-center uppercase tracking-wide ">
                Already registered?{' '}
                <a href="/auth/login" className="text-gray-900 hover:text-primary-600 underline underline-offset-4 decoration-2 transition-colors">
                    ACCESS_TERMINAL
                </a>
            </p>
        </form>
    );
}
