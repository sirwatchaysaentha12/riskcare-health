'use client';

import { validateAdminCode, validateEmail, validatePassword, validateUsername } from '@/lib/validators';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminLoginPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    adminCode: '',
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
      email: formData.email.includes('@') ? validateEmail(formData.email) : validateUsername(formData.email),
      password: validatePassword(formData.password),
      adminCode: validateAdminCode(formData.adminCode),
    };

    setErrors(newErrors);

    if (Object.values(newErrors).some((err) => err !== null)) {
      return;
    }

    setLoading(true);

    try {
      // Call Server-side Admin Verification API route
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
          adminCode: formData.adminCode.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setServerError(result.message || 'การยืนยันสิทธิ์แอดมินล้มเหลว');
        return;
      }

      router.push('/admin/dashboard');
      router.refresh();
    } catch {
      setServerError('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 sm:my-12">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-emerald-500/30 overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 items-center justify-center font-bold text-2xl mb-2 border border-emerald-500/30">
            👑
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Admin Portal Login</h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            เข้าสู่ระบบควบคุมดูแลด้วย Email/Password และ Admin Access Code
          </p>
        </div>

        {/* Server Alert Message */}
        {serverError && (
          <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span>{serverError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Admin Email */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">อีเมลผู้ดูแลระบบ (Admin Email)</label>
            <input
              type="email"
              name="email"
              placeholder="admin@healthtech.com"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all bg-slate-800 text-white ${
                errors.email
                  ? 'border-red-500 focus:ring-red-500/30'
                  : 'border-slate-700 focus:border-emerald-400 focus:ring-emerald-500/20'
              }`}
            />
            {errors.email && <p className="text-xs text-red-400 font-medium">{errors.email}</p>}
          </div>

          {/* Admin Password */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">รหัสผ่าน (Password)</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all bg-slate-800 text-white ${
                errors.password
                  ? 'border-red-500 focus:ring-red-500/30'
                  : 'border-slate-700 focus:border-emerald-400 focus:ring-emerald-500/20'
              }`}
            />
            {errors.password && <p className="text-xs text-red-400 font-medium">{errors.password}</p>}
          </div>

          {/* Admin Access Code */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-emerald-400 flex items-center justify-between">
              <span>Admin Access Code (ตรวจสอบฝั่ง Server)</span>
              <span className="text-[10px] text-slate-400 font-normal">ENV: ADMIN_ACCESS_CODE</span>
            </label>
            <input
              type="password"
              name="adminCode"
              placeholder="กรอกรหัส Admin Access Code"
              value={formData.adminCode}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all bg-slate-800 text-emerald-300 tracking-widest font-mono ${
                errors.adminCode
                  ? 'border-red-500 focus:ring-red-500/30'
                  : 'border-emerald-500/50 focus:border-emerald-400 focus:ring-emerald-500/20'
              }`}
            />
            {errors.adminCode && <p className="text-xs text-red-400 font-medium">{errors.adminCode}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-900 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>กำลังตรวจสอบสิทธิ์ Admin...</span>
              </>
            ) : (
              <span>👑 ยืนยันการเข้าสู่ระบบ Admin</span>
            )}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800">
          <Link href="/login" className="text-xs text-slate-400 hover:text-emerald-400 font-medium transition-colors">
            ← ย้อนกลับไปหน้าเข้าสู่ระบบทั่วไป
          </Link>
        </div>
      </div>
    </div>
  );
}
