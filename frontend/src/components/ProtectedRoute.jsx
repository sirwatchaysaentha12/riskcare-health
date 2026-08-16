import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children }) {
  const [session, setSession] = useState(() => (supabase ? undefined : null))
  const location = useLocation()
  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <main className="page-status" role="status" aria-live="polite"><strong>กำลังตรวจสอบสิทธิ์</strong><span>รอสักครู่ ระบบกำลังเตรียมหน้าที่ปลอดภัยสำหรับคุณ</span></main>
  return session ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />
}
