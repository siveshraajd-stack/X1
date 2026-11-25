"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginSchema } from "@/lib/validations/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data) => {
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        // Redirect will be handled by middleware based on role
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-600 border border-gray-200 shadow-sm flex items-center gap-3">
          <div className="w-6 h-6 bg-white flex items-center justify-center font-bold text-red-600 text-xs">
            !
          </div>
          <p className="text-white text-[10px] font-bold uppercase tracking-wide ">
            AUTH_ERROR: {error}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">
            Email
          </label>
          <input
            {...register("email")}
            type="text"
            placeholder="name@kaspl.net"
            className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200 ${errors.email ? "border-red-500 bg-red-50" : ""}`}
          />
          {errors.email && (
            <p className="text-[8px] font-bold text-red-600 uppercase ">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block ">
            Password
          </label>
          <input
            {...register("password")}
            type="password"
            placeholder="••••••••••••"
            className={`w-full px-4 py-3 border border-gray-200 text-[10px] font-bold uppercase outline-none focus:bg-gray-50 transition-all placeholder:text-gray-200 ${errors.password ? "border-red-500 bg-red-50" : ""}`}
          />
          {errors.password && (
            <p className="text-[8px] font-bold text-red-600 uppercase ">
              {errors.password.message}
            </p>
          )}
          <div className="text-right">
            <Link
              href="/auth/forgot-password"
              className="text-[10px] font-bold text-primary-700 uppercase tracking-wide underline underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary-700 text-white text-xs font-bold py-5 border-b-4 border-r-4 border-primary-600 uppercase tracking-wider hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all active:translate-x-1 active:translate-y-1 shadow-sm disabled:opacity-50 mt-4"
      >
        {loading ? "SIGNING IN..." : "SIGN IN"}
      </button>
    </form>
  );
}
