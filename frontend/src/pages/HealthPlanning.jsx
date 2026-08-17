import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getAirQualityStations, getUserLocation } from '../services/airQuality'
import { getAqiStatus, pm25ToAqi } from '../utils/aqiStatus'

const INITIAL_EXERCISE = { age: '', sex: 'unspecified', weight: '', height: '', days: '3', intensity: 'เบา', chronicCondition: 'ไม่มีโรคประจำตัว' }
const INITIAL_TRACKER = { condition: 'ไม่มีโรคประจำตัว', medication: 'ไม่ได้ใช้ยาประจำ', medicationName: '', dose: '', medicationTime: '', appointmentAt: '', provider: '', notes: '' }

function validNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function bmiOf(weight, height) {
  const kg = validNumber(weight)
  const cm = validNumber(height)
  return kg && cm ? kg / ((cm / 100) ** 2) : null
}

function buildExercisePlan(form, profile, aqi) {
  const bmi = bmiOf(form.weight, form.height)
  const highRisk = profile?.health_risk_group === 'high_critical'
  const indoorOnly = aqi !== null && aqi >= 101
  const jointFriendly = bmi !== null && bmi >= 30
  const safeIntensity = highRisk || jointFriendly ? 'เบา' : form.intensity
  const mode = indoorOnly ? 'ในร่มเท่านั้น' : 'ในร่มเป็นหลัก และออกกลางแจ้งเมื่อคุณภาพอากาศเหมาะสม'
  const exercises = jointFriendly || highRisk
    ? ['เดินช้าในร่ม', 'ปั่นจักรยานอยู่กับที่', 'ยืดเหยียดและฝึกการหายใจ']
    : ['เดินเร็ว', 'ปั่นจักรยาน', 'เวทเทรนนิ่งน้ำหนักเบา', 'ยืดเหยียด']
  return { bmi: bmi ? Number(bmi.toFixed(1)) : null, days: Number(form.days), intensity: safeIntensity, mode, exercises, indoorOnly, aqi }
}

export default function HealthPlanning() {
  const [profile, setProfile] = useState(null)
  const [aqi, setAqi] = useState(null)
  const [exerciseForm, setExerciseForm] = useState(INITIAL_EXERCISE)
  const [trackerForm, setTrackerForm] = useState(INITIAL_TRACKER)
  const [plan, setPlan] = useState(null)
  const [medications, setMedications] = useState([])
  const [appointments, setAppointments] = useState([])
  const [activeCard, setActiveCard] = useState(null)
  const [status, setStatus] = useState({ type: '', message: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState('')

  async function loadTracker(userId) {
    if (!supabase) return
    const [{ data: medicationRows }, { data: appointmentRows }] = await Promise.all([
      supabase.from('health_medications').select('*').eq('user_id', userId).eq('active', true).order('schedule_time'),
      supabase.from('health_appointments').select('*').eq('user_id', userId).gte('appointment_at', new Date().toISOString()).order('appointment_at'),
    ])
    setMedications(medicationRows || [])
    setAppointments(appointmentRows || [])
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!supabase) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล')
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งานการวางแผนสุขภาพ')
        const [{ data: userProfile, error }, location] = await Promise.all([
          supabase.from('profiles').select('full_name, province, health_risk_group').eq('id', user.id).maybeSingle(),
          getUserLocation().catch(() => null),
        ])
        if (error) throw error
        let currentAqi = null
        if (location) {
          const stations = await getAirQualityStations(location.latitude, location.longitude)
          const province = String(userProfile?.province || '').replace(/^จังหวัด\s*/, '')
          const localStations = stations.filter((station) => !province || String(`${station.province} ${station.locationText}`).includes(province))
          const values = (localStations.length ? localStations : stations).map((station) => Number(station.pm25)).filter((value) => Number.isFinite(value) && value > 0)
          if (values.length) currentAqi = pm25ToAqi(values.reduce((sum, value) => sum + value, 0) / values.length)
        }
        if (!cancelled) {
          setProfile(userProfile || {})
          setAqi(currentAqi)
          await loadTracker(user.id)
          setLoading(false)
        }
      } catch (error) {
        if (!cancelled) { setStatus({ type: 'error', message: error.message || 'ไม่สามารถโหลดข้อมูลการวางแผนได้' }); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const aqiStatus = useMemo(() => getAqiStatus(aqi), [aqi])

  async function enableNotifications() {
    if (!('Notification' in window)) return setNotificationStatus('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return setNotificationStatus('ยังไม่ได้อนุญาตการแจ้งเตือน')
    if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/health-planning-sw.js')
    setNotificationStatus('เปิดการแจ้งเตือนแล้ว')
  }

  async function saveExercisePlan(event) {
    event.preventDefault()
    setSaving(true)
    setStatus({ type: '', message: '' })
    const nextPlan = buildExercisePlan(exerciseForm, profile, aqi)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('health_plans').insert({ user_id: user.id, age: validNumber(exerciseForm.age), sex: exerciseForm.sex, weight_kg: validNumber(exerciseForm.weight), height_cm: validNumber(exerciseForm.height), days_per_week: Number(exerciseForm.days), intensity: nextPlan.intensity, chronic_condition: exerciseForm.chronicCondition, risk_group: profile?.health_risk_group || 'low', province: profile?.province || null, aqi: aqi, plan_json: nextPlan })
      if (error) throw error
      setPlan(nextPlan)
      setStatus({ type: 'success', message: 'สร้างและบันทึกแผนการออกกำลังกายเรียบร้อยแล้ว' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'บันทึกแผนไม่สำเร็จ กรุณาลองใหม่' })
    } finally { setSaving(false) }
  }

  async function saveTracker(event) {
    event.preventDefault()
    setSaving(true)
    setStatus({ type: '', message: '' })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (trackerForm.medication !== 'ไม่ได้ใช้ยาประจำ' && trackerForm.medicationName && trackerForm.medicationTime) {
        const { error } = await supabase.from('health_medications').insert({ user_id: user.id, name: trackerForm.medicationName, dose: trackerForm.dose || null, schedule_time: trackerForm.medicationTime, condition_name: trackerForm.condition, active: true })
        if (error) throw error
      }
      if (trackerForm.appointmentAt) {
        const { error } = await supabase.from('health_appointments').insert({ user_id: user.id, appointment_at: new Date(trackerForm.appointmentAt).toISOString(), provider: trackerForm.provider || null, notes: trackerForm.notes || null })
        if (error) throw error
      }
      await loadTracker(user.id)
      setTrackerForm(INITIAL_TRACKER)
      setStatus({ type: 'success', message: 'บันทึกข้อมูลยาและนัดหมายเรียบร้อยแล้ว' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่' })
    } finally { setSaving(false) }
  }

  if (loading) return <main className="health-planning-page"><div className="page-status" role="status"><strong>กำลังเตรียมการวางแผนสุขภาพ</strong><span>กำลังโหลดข้อมูลสุขภาพและค่าฝุ่นของคุณ</span></div></main>

  return <main className="health-planning-page">
    <header className="health-planning-header"><Link to="/" className="health-planning-back">← กลับหน้าหลัก</Link><p className="eyebrow">HEALTH PLANNING</p><h1>การวางแผนเพื่อสุขภาพ</h1><p>จัดการการออกกำลังกาย ยา และนัดหมายให้เหมาะกับสุขภาพของคุณ</p></header>
    {status.message && <p className={`health-planning-status health-planning-status--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>}
    <section className="health-planning-context"><span>กลุ่มความเสี่ยง: <strong>{profile?.health_risk_group === 'high_critical' ? 'สูง/ฉุกเฉิน' : profile?.health_risk_group === 'moderate' ? 'ปานกลาง' : 'ต่ำ'}</strong></span><span>ค่า AQI ในพื้นที่: <strong>{aqi === null ? 'รอข้อมูล' : `${aqi} · ${aqiStatus.label}`}</strong></span></section>
    <section className="health-planning-grid">
      <article className={`health-plan-card ${activeCard === 'exercise' ? 'is-active' : ''}`}><button className="health-plan-card-trigger" type="button" onClick={() => setActiveCard(activeCard === 'exercise' ? null : 'exercise')}><span className="health-plan-icon">🏃</span><span><strong>แผนการออกกำลังกายอัจฉริยะ</strong><small>วางแผนตาม BMI ความเสี่ยง และ AQI</small></span><b>{activeCard === 'exercise' ? '−' : '+'}</b></button>{activeCard === 'exercise' && <form className="health-planning-form" onSubmit={saveExercisePlan}><label>อายุ<input type="number" min="1" max="120" value={exerciseForm.age} onChange={(event) => setExerciseForm({ ...exerciseForm, age: event.target.value })} placeholder="เช่น 35" /></label><label>เพศ<select value={exerciseForm.sex} onChange={(event) => setExerciseForm({ ...exerciseForm, sex: event.target.value })}><option value="unspecified">ไม่ระบุ</option><option value="female">หญิง</option><option value="male">ชาย</option></select></label><div className="health-form-row"><label>น้ำหนัก (กก.)<input type="number" min="1" max="500" step="0.1" value={exerciseForm.weight} onChange={(event) => setExerciseForm({ ...exerciseForm, weight: event.target.value })} required /></label><label>ส่วนสูง (ซม.)<input type="number" min="50" max="250" step="0.1" value={exerciseForm.height} onChange={(event) => setExerciseForm({ ...exerciseForm, height: event.target.value })} required /></label></div><label>วันที่ต้องการออกกำลังกายต่อสัปดาห์<select value={exerciseForm.days} onChange={(event) => setExerciseForm({ ...exerciseForm, days: event.target.value })}><option value="1">1 วัน</option><option value="2">2 วัน</option><option value="3">3 วัน</option><option value="4">4 วัน</option><option value="5">5 วัน</option><option value="6">6 วัน</option><option value="7">7 วัน</option></select></label><label>ระดับความหนัก<select value={exerciseForm.intensity} onChange={(event) => setExerciseForm({ ...exerciseForm, intensity: event.target.value })}><option>เบา</option><option>ปานกลาง</option><option>หนัก</option></select></label><label>โรคประจำตัว<select value={exerciseForm.chronicCondition} onChange={(event) => setExerciseForm({ ...exerciseForm, chronicCondition: event.target.value })}><option>ไม่มีโรคประจำตัว</option><option>หอบหืด</option><option>COPD</option><option>โรคหัวใจ</option><option>เบาหวาน</option><option>อื่น ๆ</option></select></label><button className="health-primary-button" type="submit" disabled={saving}>{saving ? 'กำลังสร้างแผน...' : 'สร้างแผนการออกกำลังกาย'}</button></form>}{plan && <div className="health-plan-result"><strong>แผนที่เหมาะกับคุณ</strong><span>{plan.days} วัน/สัปดาห์ · ระดับ{plan.intensity}</span><span>รูปแบบ: {plan.mode}</span>{plan.bmi && <span>BMI โดยประมาณ: {plan.bmi}</span>}<ul>{plan.exercises.map((exercise) => <li key={exercise}>{exercise}</li>)}</ul></div>}</article>
      <article className={`health-plan-card ${activeCard === 'tracker' ? 'is-active' : ''}`}><button className="health-plan-card-trigger" type="button" onClick={() => setActiveCard(activeCard === 'tracker' ? null : 'tracker')}><span className="health-plan-icon">💊</span><span><strong>ติดตามสุขภาพ ยา และนัดพบแพทย์</strong><small>บันทึกข้อมูลและเตือนสิ่งสำคัญ</small></span><b>{activeCard === 'tracker' ? '−' : '+'}</b></button>{activeCard === 'tracker' && <form className="health-planning-form" onSubmit={saveTracker}><label>โรคประจำตัว<select value={trackerForm.condition} onChange={(event) => setTrackerForm({ ...trackerForm, condition: event.target.value })}><option>ไม่มีโรคประจำตัว</option><option>หอบหืด</option><option>COPD</option><option>โรคหัวใจ</option><option>เบาหวาน</option><option>อื่น ๆ</option></select></label><label>ยาที่ใช้ประจำ<select value={trackerForm.medication} onChange={(event) => setTrackerForm({ ...trackerForm, medication: event.target.value })}><option>ไม่ได้ใช้ยาประจำ</option><option>ใช้ยาประจำ</option></select></label>{trackerForm.medication === 'ใช้ยาประจำ' && <><label>ชื่อยา<input value={trackerForm.medicationName} onChange={(event) => setTrackerForm({ ...trackerForm, medicationName: event.target.value })} required /></label><div className="health-form-row"><label>ขนาดยา<input value={trackerForm.dose} onChange={(event) => setTrackerForm({ ...trackerForm, dose: event.target.value })} placeholder="เช่น 1 เม็ด" /></label><label>เวลาทานยา<input type="time" value={trackerForm.medicationTime} onChange={(event) => setTrackerForm({ ...trackerForm, medicationTime: event.target.value })} required /></label></div></>}<label>วันและเวลานัดพบแพทย์<input type="datetime-local" value={trackerForm.appointmentAt} onChange={(event) => setTrackerForm({ ...trackerForm, appointmentAt: event.target.value })} /></label><label>ชื่อสถานพยาบาล/แพทย์<input value={trackerForm.provider} onChange={(event) => setTrackerForm({ ...trackerForm, provider: event.target.value })} placeholder="ไม่ระบุก็ได้" /></label><label>หมายเหตุ<textarea rows="3" value={trackerForm.notes} onChange={(event) => setTrackerForm({ ...trackerForm, notes: event.target.value })} /></label><button className="health-primary-button" type="submit" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</button><button className="health-secondary-button" type="button" onClick={enableNotifications}>เปิดการแจ้งเตือน</button>{notificationStatus && <p className="health-form-note" role="status">{notificationStatus}</p>}<p className="health-form-note">เลือก “ไม่มี” ได้เสมอ หากไม่มีโรคประจำตัวหรือไม่ได้ใช้ยาประจำ</p></form>}{activeCard === 'tracker' && <div className="health-records"><strong>รายการที่บันทึกไว้</strong>{medications.length ? medications.map((item) => <span key={item.id}>💊 {item.name} · {item.schedule_time}</span>) : <small>ยังไม่มีรายการยา</small>}{appointments.length ? appointments.map((item) => <span key={item.id}>📅 {new Date(item.appointment_at).toLocaleString('th-TH')}</span>) : <small>ยังไม่มีนัดหมาย</small>}</div>}</article>
    </section>
    <p className="health-planning-disclaimer">ระบบนี้เป็นเครื่องมือช่วยวางแผนเบื้องต้น ไม่ใช่คำวินิจฉัยทางการแพทย์ หากมีโรคประจำตัวหรืออาการผิดปกติ ควรปรึกษาบุคลากรทางการแพทย์ก่อนเริ่มออกกำลังกาย</p>
  </main>
}
