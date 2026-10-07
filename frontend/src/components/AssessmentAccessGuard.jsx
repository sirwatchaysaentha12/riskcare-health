import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ─── AssessmentAccessGuard — บังคับผู้ใช้ใหม่ทำแบบประเมินก่อนเข้าหน้าหลัก ───
 * แหล่งความจริงเดียว: profiles.has_completed_assessment (Supabase) — ไม่ใช้ localStorage เป็นหลัก
 *
 * AssessmentGuard  (ครอบกลุ่มหน้าหลักทั้งหมดใน AppLayout)
 *   - has_completed_assessment = false และไม่ใช่ admin → redirect ไป /onboarding/assessment
 *   - admin และไม่พบ profile ผ่านได้ (ระบบแอดมินแยก / บัญชีใหม่ที่ trigger ยังสร้าง profile ไม่เสร็จ)
 *
 * OnboardingGuard  (ครอบหน้า /onboarding/assessment)
 *   - ไม่ล็อกอิน → /login
 *   - ทำแบบประเมินแล้ว (และไม่ใช่ admin) → กลับหน้าหลัก "/" ไม่ให้ทำซ้ำโดยไม่จำเป็น
 *
 * ตรวจครั้งเดียวตอน mount — guard ครอบ layout ที่คงอยู่ตลอดการใช้งาน และหน้า onboarding
 * เป็น route แยก (ออกจาก layout ก่อนเสมอ) จึงไม่มี stale state และไม่เกิด redirect loop
 */

function GuardStatus({ children }) {
  return (
    <main className="page-status" role="status" aria-live="polite">
      <strong>กำลังตรวจสอบสถานะแบบประเมิน</strong>
      <span>รอสักครู่ ระบบกำลังเตรียมหน้าสำหรับคุณ</span>
      {children}
    </main>
  )
}

async function fetchAssessmentStatus() {
  // คืนค่า: 'allow' | 'needs-assessment' | 'signed-out' | 'admin'
  if (!supabase) return 'allow'
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'signed-out'
  const { data: profile } = await supabase
    .from('profiles')
    .select('has_completed_assessment, role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) return 'allow' // บัญชียังไม่มีแถว profile (trigger ยังไม่ทำงาน) — ไม่บังคับ
  if (profile.role === 'admin') return 'admin'
  return profile.has_completed_assessment === true ? 'allow' : 'needs-assessment'
}

export function AssessmentGuard({ children }) {
  const [status, setStatus] = useState('checking')
  useEffect(() => {
    let cancelled = false
    fetchAssessmentStatus().then((result) => {
      if (cancelled) return
      if (result === 'signed-out') setStatus('login')
      else setStatus(result === 'needs-assessment' ? 'redirect' : 'allow')
    })
    return () => { cancelled = true }
  }, [])
  if (status === 'checking') return <GuardStatus />
  if (status === 'login') return <Navigate to="/login" replace />
  if (status === 'redirect') return <Navigate to="/onboarding/assessment" replace />
  return children
}

export function OnboardingGuard({ children }) {
  const [status, setStatus] = useState('checking')
  useEffect(() => {
    let cancelled = false
    fetchAssessmentStatus().then((result) => {
      if (!cancelled) {
        if (result === 'signed-out') setStatus('login')
        else if (result === 'allow') setStatus('home')
        else setStatus('stay') // needs-assessment หรือ admin (แอดมินเข้าได้ แต่ไม่ถูกบังคับ)
      }
    })
    return () => { cancelled = true }
  }, [])
  if (status === 'checking') return <GuardStatus />
  if (status === 'login') return <Navigate to="/login" replace />
  if (status === 'home') return <Navigate to="/" replace />
  return children
}
