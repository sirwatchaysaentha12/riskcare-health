import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ─── AssessmentGate — ระบบเช็คว่าผู้ใช้เคยทำแบบประเมินสุขภาพหรือยัง ───
 * แสดงแถบเตือนแบบไม่บังคับ (dismissible) บนทุกหน้า ถ้า:
 *   - ล็อกอินอยู่ และ profiles.has_completed_assessment = false
 *   - ไม่อยู่บนหน้าแบบประเมินเอง (/risk-assessment, /assessment)
 *   - ยังไม่กด "ทำภายหลัง" ใน session นี้ (sessionStorage)
 * ปิดการแสดงสำหรับ admin (มีหน้าระบบแยก) และผู้ใช้ที่ไม่ล็อกอิน
 * หลังทำแบบประเมินเสร็จ (has_completed_assessment = true) แถบจะหายเอง
 */

const DISMISS_KEY = 'assessment_gate_dismissed'
const EXCLUDED_PATHS = ['/risk-assessment', '/assessment', '/login', '/admin']

export default function AssessmentGate() {
  const location = useLocation()
  const navigate = useNavigate()
  const [status, setStatus] = useState('checking') // checking | show | hide

  useEffect(() => {
    if (EXCLUDED_PATHS.some((path) => location.pathname.startsWith(path))) {
      setStatus('hide')
      return
    }
    if (sessionStorage.getItem(DISMISS_KEY) === '1') {
      setStatus('hide')
      return
    }
    let cancelled = false
    supabase?.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) return
      if (!user) { setStatus('hide'); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('has_completed_assessment, role')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (!profile || profile.role === 'admin' || profile.has_completed_assessment === true) {
        setStatus('hide')
        return
      }
      setStatus('show')
    })
    return () => { cancelled = true }
  }, [location.pathname])

  function startAssessment() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setStatus('hide')
    navigate('/risk-assessment')
  }

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setStatus('hide')
  }

  if (status !== 'show') return null

  return (
    <div className="assessment-gate" role="region" aria-label="แจ้งเตือนแบบประเมินสุขภาพ">
      <span className="assessment-gate-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </span>
      <p className="assessment-gate-text">
        <b>ขั้นตอนแรกของการใช้งาน:</b> ทำแบบประเมินสุขภาพ 14 ข้อ (ใช้เวลา ~3 นาที) เพื่อให้ระบบประเมินความเสี่ยงทางเดินหายใจของคุณได้ถูกต้อง
      </p>
      <div className="assessment-gate-actions">
        <button className="assessment-gate-btn assessment-gate-btn-primary" type="button" onClick={startAssessment}>
          เริ่มทำแบบประเมิน
        </button>
        <button className="assessment-gate-btn assessment-gate-btn-ghost" type="button" onClick={dismiss}>
          ทำภายหลัง
        </button>
      </div>
    </div>
  )
}
