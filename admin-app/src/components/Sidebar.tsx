'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const items = [['🏠', 'หน้าแรก', '/'], ['👤', 'โปรไฟล์ส่วนตัว', '/profile'], ['📋', 'ประวัติการใช้งาน', '/history'], ['📊', 'รายงาน / สถิติ', '/reports'], ['⚙️', 'ตั้งค่าระบบ', '/settings']];
export default function Sidebar() {
  const path = usePathname(); const router = useRouter(); const [open, setOpen] = useState(false);
  useEffect(() => { const fn = () => setOpen(v => !v); window.addEventListener('sidebar:toggle', fn); return () => window.removeEventListener('sidebar:toggle', fn); }, []);
  if (['/login', '/signup', '/forgot-password', '/reset-password', '/admin/login'].includes(path)) return null;
  return <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-16 left-0 z-40 w-72 bg-slate-950 p-5 text-slate-200 shadow-2xl transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:translate-x-0`}><p className="mb-6 text-xs font-bold uppercase tracking-widest text-emerald-400">เมนูหลัก</p><nav className="space-y-2">{items.map(([icon, label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-slate-800"><span>{icon}</span>{label}</Link>)}</nav><button onClick={async () => { await createClient().auth.signOut(); router.push('/login'); router.refresh(); }} className="mt-8 flex w-full gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-300">🚪 ออกจากระบบ</button></aside>;
}
