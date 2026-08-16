'use client';

import { createClient } from '@/lib/supabase/client';
import { validateConfirmPassword, validatePassword } from '@/lib/validators';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string | null }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      setHasSession(Boolean(data.session));
      setSessionReady(true);
      if (error || !data.session) {
        setServerError('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว');
      }
    };

    void checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!active) return;
        setHasSession(Boolean(session));
        setSessionReady(true);
      }
    );

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionReady || !hasSession) return;
    setServerError(null);
    setServerSuccess(null);

    const newErrors = {
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    };

    setErrors(newErrors);
    if (Object.values(newErrors).some((err) => err !== null)) return;

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setServerError(error.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน');
        return;
      }

      setServerSuccess('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว! กำลังนำคุณไปยังหน้าเข้าสู่ระบบ...');
      setTimeout(() => {
        router.push('/login');
      }, 1500);
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
            🔑
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-slate-500 text-xs sm:text-sm">
            กรุณากรอกรหัสผ่านใหม่ที่คุณต้องการใช้งาน
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
            <label className="block text-xs font-semibold text-slate-700">รหัสผ่านใหม่</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((prev) => ({ ...prev, password: null }));
              }}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.password
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.password && <p className="text-xs text-red-500 font-medium">{errors.password}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrors((prev) => ({ ...prev, confirmPassword: null }));
              }}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.confirmPassword
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.confirmPassword && <p className="text-xs text-red-500 font-medium">{errors.confirmPassword}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !sessionReady || !hasSession}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-900 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>กำลังบันทึกรหัสผ่านใหม่...</span>
              </>
            ) : (
              <span>บันทึกรหัสผ่านใหม่</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
