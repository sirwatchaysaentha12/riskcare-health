'use client';

import { validateEmail, validatePassword, validateUsername } from '@/lib/validators';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string | null }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: null }));
    setServerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const newErrors = {
      email: formData.email.includes('@')
        ? validateEmail(formData.email)
        : validateUsername(formData.email),
      password: validatePassword(formData.password),
    };

    setErrors(newErrors);

    if (Object.values(newErrors).some((err) => err !== null)) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: formData.email.trim(), password: formData.password }),
      });
      const result = await response.json();
      const error = { message: result.message as string | undefined };

      if (!response.ok || !result.success) {
        setServerError(
          result.message === 'Invalid login credentials'
            ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
            : error.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
        );
        return;
      }

      if (result.role === 'admin') window.location.href = 'http://localhost:3000/admin/dashboard';
      else if (result.role === 'user') { router.push('/profile'); router.refresh(); }
      else setServerError('ไม่พบสิทธิ์ผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ');
    } catch {
      setServerError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 sm:my-12">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 items-center justify-center font-bold text-xl mb-2">
            🔐
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">เข้าสู่ระบบ</h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            ยินดีต้อนรับกลับ! กรุณากรอกอีเมลและรหัสผ่านเพื่อเข้าใช้งาน
          </p>
        </div>

        {/* Server Alert Message */}
        {serverError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span>{serverError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">อีเมล</label>
            <input
              type="text"
              name="email"
              placeholder="Email หรือ Username"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.email
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.email && <p className="text-xs text-red-500 font-medium">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-700">รหัสผ่าน</label>
              <Link href="/forgot-password" className="text-xs text-emerald-600 hover:underline font-medium">
                ลืมรหัสผ่าน?
              </Link>
            </div>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.password
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.password && <p className="text-xs text-red-500 font-medium">{errors.password}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-900 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>กำลังเข้าสู่ระบบ...</span>
              </>
            ) : (
              <span>เข้าสู่ระบบ</span>
            )}
          </button>
        </form>

        {/* Links */}
        <div className="space-y-3 pt-2 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            ยังไม่มีบัญชีผู้ใช้?{' '}
            <Link href="/signup" className="text-emerald-600 font-bold hover:underline">
              สมัครสมาชิกที่นี่
            </Link>
          </p>

          <div className="hidden pt-2">
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-emerald-700 hover:bg-slate-100 transition-all border border-slate-200"
            >
              <span>🔑 เข้าสู่ระบบสำหรับ Admin</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
