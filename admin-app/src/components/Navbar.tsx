'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
  role: string;
}

export default function Navbar() {
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        const { data } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, role')
          .eq('id', user.id)
          .single();
        if (data) setProfile(data);
      }
    }
    loadUser();
  }, [supabase]);

  if (['/login', '/signup', '/forgot-password', '/reset-password', '/admin/login'].includes(pathname)) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <nav className="bg-slate-900 text-white border-b border-emerald-500/20 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <button aria-label="เปิดเมนู" onClick={() => window.dispatchEvent(new CustomEvent('sidebar:toggle'))} className="mr-3 text-2xl text-emerald-300">☰</button>
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-white hover:text-emerald-400 transition-colors">
            <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-900 font-extrabold text-lg">
              H
            </span>
            <span>HealthTech <span className="text-emerald-400 font-normal text-sm">Auth System</span></span>
          </Link>

          <div className="flex items-center gap-4">
            {userEmail ? (
              <>
                {profile?.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
                  >
                    👑 Admin Dashboard
                  </Link>
                )}
                <Link
                  href="/profile"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-200 hover:text-emerald-400 hover:bg-slate-800 transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-500/30 overflow-hidden">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      (profile?.full_name || userEmail)?.[0]?.toUpperCase() || 'U'
                    )}
                  </div>
                  <span className="hidden sm:inline font-medium text-xs">
                    {profile?.full_name || userEmail}
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-all border border-slate-700"
                >
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-1.5 text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold rounded-lg transition-all shadow-sm shadow-emerald-500/20"
                >
                  สมัครสมาชิก
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
