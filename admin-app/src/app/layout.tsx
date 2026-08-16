import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HealthTech — Auth & Admin System',
  description: 'Authentication and Admin Management System powered by Next.js and Supabase',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col antialiased">
        <Navbar />
        <div className="flex flex-1"><Sidebar /><main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">{children}</main></div>
        <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-6 text-center text-xs">
          <div className="max-w-7xl mx-auto px-4">
            HealthTech System © 2026 — Modern Health Care Platform
          </div>
        </footer>
      </body>
    </html>
  );
}
