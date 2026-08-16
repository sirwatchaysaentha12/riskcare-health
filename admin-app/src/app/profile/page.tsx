'use client';

import { createClient } from '@/lib/supabase/client';
import { validateFullName, validatePhone } from '@/lib/validators';
import { useEffect, useState } from 'react';

interface ProfileData {
  id: string;
  full_name: string;
  phone: string;
  avatar_url: string;
  role: string;
}

export default function ProfilePage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [profile, setProfile] = useState<ProfileData>({
    id: '',
    full_name: '',
    phone: '',
    avatar_url: '',
    role: 'user',
  });

  const [errors, setErrors] = useState<{ [key: string]: string | null }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverSuccess, setServerSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setUserEmail(user.email || '');

        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone, avatar_url, role')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          setServerError('เกิดข้อผิดพลาดในการโหลดข้อมูลโปรไฟล์');
        } else if (data) {
          setProfile({
            id: data.id,
            full_name: data.full_name || '',
            phone: data.phone || '',
            avatar_url: data.avatar_url || '',
            role: data.role || 'user',
          });
        }
      } catch {
        setServerError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [supabase]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: null }));
    setServerError(null);
    setServerSuccess(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setServerError('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setServerError('ขนาดไฟล์รูปภาพต้องไม่เกิน 2MB');
      return;
    }

    setUploading(true);
    setServerError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${profile.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        setServerError(`อัปโหลดรูปภาพไม่สำเร็จ: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = publicUrlData.publicUrl;

      // Update in profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id);

      if (updateError) {
        setServerError('บันทึกรูปโปรไฟล์ในฐานข้อมูลไม่สำเร็จ');
      } else {
        setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
        setServerSuccess('อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว!');
      }
    } catch {
      setServerError('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setServerSuccess(null);

    const newErrors = {
      full_name: validateFullName(profile.full_name),
      phone: validatePhone(profile.phone),
    };

    setErrors(newErrors);
    if (Object.values(newErrors).some((err) => err !== null)) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name.trim(),
          phone: profile.phone.trim(),
        })
        .eq('id', profile.id);

      if (error) {
        setServerError(error.message || 'บันทึกข้อมูลโปรไฟล์ไม่สำเร็จ');
      } else {
        setServerSuccess('บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว!');
      }
    } catch {
      setServerError('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-emerald-600 font-semibold">
          <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>กำลังโหลดข้อมูลโปรไฟล์...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto my-8 space-y-6">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Header with Role Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">โปรไฟล์ผู้ใช้งาน</h1>
            <p className="text-xs sm:text-sm text-slate-500">{userEmail}</p>
          </div>
          <div>
            {profile.role === 'admin' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold text-xs">
                👑 Admin Access
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-semibold text-xs">
                👤 สมาชิกทั่วไป (User)
              </span>
            )}
          </div>
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

        {/* Avatar Upload Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="relative w-24 h-24 rounded-full bg-slate-200 border-2 border-emerald-500 overflow-hidden flex items-center justify-center text-slate-400 font-bold text-3xl shrink-0 shadow-inner">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="Profile Avatar" className="w-full h-full object-cover" />
            ) : (
              (profile.full_name || userEmail)?.[0]?.toUpperCase() || 'U'
            )}

            {uploading && (
              <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
                <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>

          <div className="space-y-2 text-center sm:text-left">
            <h3 className="font-semibold text-slate-800 text-sm">รูปโปรไฟล์</h3>
            <p className="text-xs text-slate-500">รองรับไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 2MB (เก็บใน Supabase Storage Bucket &apos;avatars&apos;)</p>
            <label className="inline-block px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer shadow-sm transition-all">
              <span>{uploading ? 'กำลังอัปโหลด...' : '📷 เปลี่ยนรูปโปรไฟล์'}</span>
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleAvatarUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Profile Update Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">ชื่อ-นามสกุล</label>
            <input
              type="text"
              name="full_name"
              value={profile.full_name}
              onChange={handleChange}
              disabled={saving}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.full_name
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.full_name && <p className="text-xs text-red-500 font-medium">{errors.full_name}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">เบอร์โทรศัพท์ (ไทย)</label>
            <input
              type="tel"
              name="phone"
              value={profile.phone}
              onChange={handleChange}
              disabled={saving}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${
                errors.phone
                  ? 'border-red-300 focus:ring-red-200 text-red-900 bg-red-50/50'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100 bg-white'
              }`}
            />
            {errors.phone && <p className="text-xs text-red-500 font-medium">{errors.phone}</p>}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="py-3 px-6 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-900 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <span>💾 บันทึกการเปลี่ยนแปลง</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
