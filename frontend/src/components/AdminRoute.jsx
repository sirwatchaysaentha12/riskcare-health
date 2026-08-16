import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LogoIcon from './LogoIcon'

export default function AdminRoute({ children }) {
  const [state, setState] = useState('checking')
  const location = useLocation()
  useEffect(() => {
    let active = true
    async function check() {
      if (!supabase) return setState('denied')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return active && setState('denied')
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (active) setState(profile?.role === 'admin' ? 'allowed' : 'denied')
    }
    check(); return () => { active = false }
  }, [])
  if (state === 'checking') return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', color: '#047857' }}><div style={{ textAlign: 'center' }}><LogoIcon /><div style={{ width: 34, height: 34, margin: '22px auto 14px', border: '4px solid #d1fae5', borderTopColor: '#10b981', borderRadius: '50%', animation: 'admin-spin .8s linear infinite' }} /><p>กำลังตรวจสอบสิทธิ์การเข้าถึง...</p></div></main>
  return state === 'allowed' ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />
}
