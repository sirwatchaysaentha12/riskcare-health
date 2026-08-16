'use client';

import { createClient } from '@/lib/supabase/client';
import {
  validateConfirmPassword,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
  validateUsername,
} from '@/lib/validators';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string | null }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = useState<string | null>(null);
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
    setServerSuccess(null);

    // Validate inputs
    const newErrors = {
      username: validateUsername(formData.username),
      fullName: validateFullName(formData.fullName),
      phone: validatePhone(formData.phone),
      email: validateEmail(formData.email),
      password: validatePassword(formData.password),
      confirmPassword: validateConfirmPassword(formData.password, formData.confirmPassword),
    };

    setErrors(newErrors);

    if (Object.values(newErrors).some((err) => err !== null)) {
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            username: formData.username.trim().toLowerCase(),
            full_name: formData.fullName.trim(),
            phone: formData.phone.trim(),
          },
        },
      });

      if (error) {
        setServerError(error.message || 'เกิดข้อผิดพลาดในการลงทะเบียน');
        return;
      }

      if (data.user && !data.session) {
        setServerSuccess('สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ');
      } else {
        setServerSuccess('สมัครสมาชิกสำเร็จ! กำลังนำคุณไปยังหน้าโปรไฟล์...');
        setTimeout(() => {
          router.push('/login');
          router.refresh();
        }, 1500);
      }
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
            🌱
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">สมัครสมาชิกใหม่</h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            ลงทะเบียนเพื่อเข้าใช้งานระบบประเมินสุขภาพและจัดการโปรไฟล์
          </p>
        </div>

        {/* Server Alert Messages */}
        {serverError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span>{serverError}</span>
          </div>
        )}

        {serverSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span>✅</span>
            <span>{serverSuccess}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">Username <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="username"
              placeholder="username"
              value={formData.username}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.username
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.username && <p className="text-xs text-red-500 font-medium">{errors.username}</p>}
          </div>

          {/* Full Name */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
            <input
              type="text"
              name="fullName"
              placeholder="สมชาย เข็มกลัด"
              value={formData.fullName}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.fullName
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.fullName && <p className="text-xs text-red-500 font-medium">{errors.fullName}</p>}
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">เบอร์โทรศัพท์ (ไทย) <span className="text-red-500">*</span></label>
            <input
              type="tel"
              name="phone"
              placeholder="0812345678"
              value={formData.phone}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.phone
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.phone && <p className="text-xs text-red-500 font-medium">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">อีเมล <span className="text-red-500">*</span></label>
            <input
              type="email"
              name="email"
              placeholder="user@example.com"
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
            <label className="block text-xs font-semibold text-slate-700">รหัสผ่าน <span className="text-red-500">* (8–64 ตัว มีตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข)</span></label>
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

          {/* Confirm Password */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">ยืนยันรหัสผ่าน <span className="text-red-500">*</span></label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.confirmPassword
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.confirmPassword && <p className="text-xs text-red-500 font-medium">{errors.confirmPassword}</p>}
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
                <span>กำลังลงทะเบียน...</span>
              </>
            ) : (
              <span>สมัครสมาชิก</span>
            )}
          </button>
        </form>

        {/* Footer link */}
        <div className="text-center pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            มีบัญชีผู้ใช้อยู่แล้ว?{' '}
            <Link href="/login" className="text-emerald-600 font-bold hover:underline">
              เข้าสู่ระบบที่นี่
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
