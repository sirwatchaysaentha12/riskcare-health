'use client';

import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useState } from 'react';

interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

export default function AdminDashboardPage() {
  const supabase = createClient();

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) {
        setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสมาชิกระบบ');
      } else {
        setProfiles(data || []);
      }
    } catch {
      setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProfiles();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchProfiles]);

  const handleRoleToggle = async (profileId: string, currentRole: 'user' | 'admin') => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const confirmMsg = `คุณต้องการเปลี่ยนสิทธิ์ของสมาชิกนี้เป็น ${newRole === 'admin' ? '👑 Admin' : '👤 User'} ใช่หรือไม่?`;
    if (!window.confirm(confirmMsg)) return;

    setUpdatingId(profileId);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', profileId);

      if (updateError) {
        alert(`เปลี่ยนสิทธิ์ไม่สำเร็จ: ${updateError.message}`);
      } else {
        setProfiles((prev) =>
          prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
        );
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    const term = search.toLowerCase();
    return (
      (p.full_name && p.full_name.toLowerCase().includes(term)) ||
      (p.phone && p.phone.includes(term)) ||
      p.role.includes(term) ||
      p.id.includes(term)
    );
  });

  const totalUsers = profiles.length;
  const totalAdmins = profiles.filter((p) => p.role === 'admin').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-2xl border border-emerald-500/30 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Server Verified</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">👑 Admin Control Dashboard</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            จัดการรายชื่อผู้ใช้งานและควบคุมสิทธิ์การเข้าถึงระบบทั้งหมด
          </p>
        </div>

        <button
          onClick={fetchProfiles}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold rounded-xl border border-emerald-500/30 text-xs transition-all flex items-center gap-1.5"
        >
          <span>🔄</span>
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-slate-500">ผู้ใช้งานทั้งหมดในระบบ</span>
          <p className="text-3xl font-extrabold text-slate-900">{totalUsers} <span className="text-sm font-normal text-slate-500">คน</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-amber-700">จำนวน Admin</span>
          <p className="text-3xl font-extrabold text-amber-600">{totalAdmins} <span className="text-sm font-normal text-slate-500">คน</span></p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm space-y-1">
          <span className="text-xs font-semibold text-emerald-700">จำนวน User ทั่วไป</span>
          <p className="text-3xl font-extrabold text-emerald-600">{totalUsers - totalAdmins} <span className="text-sm font-normal text-slate-500">คน</span></p>
        </div>
      </div>

      {/* Search & Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Search Bar Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
          <h2 className="font-bold text-slate-900 text-lg">รายชื่อผู้ใช้งานระบบ ({filteredProfiles.length})</h2>
          <div className="relative max-w-xs w-full">
            <input
              type="text"
              placeholder="🔍 ค้นหาตามชื่อ, เบอร์โทร, สิทธิ์..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        {/* Table / Error / Loading */}
        {error && (
          <div className="p-6 text-center text-red-600 font-semibold text-sm">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-500 font-medium text-sm flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>กำลังโหลดรายชื่อผู้ใช้...</span>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            ไม่พบข้อมูลผู้ใช้งานที่ตรงกับการค้นหา
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">ผู้ใช้งาน</th>
                  <th className="py-3.5 px-4 sm:px-6">เบอร์โทรศัพท์</th>
                  <th className="py-3.5 px-4 sm:px-6">สิทธิ์ในระบบ</th>
                  <th className="py-3.5 px-4 sm:px-6">วันที่ลงทะเบียน</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">จัดการสิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {filteredProfiles.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* User Info */}
                    <td className="py-4 px-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 border border-emerald-300 overflow-hidden text-xs">
                          {user.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            user.full_name?.[0]?.toUpperCase() || 'U'
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{user.full_name || 'ไม่ระบุชื่อ'}</p>
                          <p className="text-[11px] font-mono text-slate-400">{user.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="py-4 px-4 sm:px-6 font-medium text-slate-700">
                      {user.phone || '-'}
                    </td>

                    {/* Role Badge */}
                    <td className="py-4 px-4 sm:px-6">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold text-xs">
                          👑 Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full font-medium text-xs">
                          👤 User
                        </span>
                      )}
                    </td>

                    {/* Created Date */}
                    <td className="py-4 px-4 sm:px-6 text-slate-500 font-medium">
                      {new Date(user.created_at).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    {/* Action Button */}
                    <td className="py-4 px-4 sm:px-6 text-right">
                      <button
                        onClick={() => handleRoleToggle(user.id, user.role)}
                        disabled={updatingId === user.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border disabled:opacity-50 ${
                          user.role === 'admin'
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {updatingId === user.id
                          ? 'กำลังอัปเดต...'
                          : user.role === 'admin'
                          ? 'ลดสิทธิ์เป็น User'
                          : 'โปรโมตเป็น Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
