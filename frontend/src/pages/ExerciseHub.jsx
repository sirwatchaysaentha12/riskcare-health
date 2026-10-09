import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeProvinceAreas } from '../utils/provinceAirQuality'
import { getPersonalizedPm25Result } from '../utils/personalizedPm25'

const tabs = [
  { id: 'today', label: 'วันนี้', icon: '◷' },
  { id: 'activity', label: 'ทำกิจกรรม', icon: '＋' },
  { id: 'plan', label: 'แผนของฉัน', icon: '▤' },
  { id: 'history', label: 'ประวัติ', icon: '↺' },
  { id: 'settings', label: 'ตั้งค่าแผน', icon: '⚙' },
]
const pendingRuleNotes = [
  'ช่วงเวลาที่เหมาะสมต่อครั้งและความหนักที่ปลอดภัย',
  'จำนวนวันพักและจำนวนวันออกกำลังกายติดกันสูงสุด',
  'วิธีปรับแผนเมื่อมีโรคประจำตัวหรือผลประเมินความเสี่ยงสูง',
  'เกณฑ์เลือกในร่ม กลางแจ้ง หรือพัก ตามค่าฝุ่นและกลุ่มผู้ใช้',
]

const display = (value, fallback = 'ยังไม่มีข้อมูล') => value === null || value === undefined || value === '' ? fallback : value
const durationLabel = (seconds = 0) => `${Math.floor(seconds / 60)} นาที ${seconds % 60} วินาที`
const formatDate = (value) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date(value))

function ErrorNotice({ children }) {
  return <p className="eh-notice eh-notice--warning" role="status">{children}</p>
}

export default function ExerciseHub() {
  const [activeTab, setActiveTab] = useState('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState(null)
  const [assessment, setAssessment] = useState(null)
  const [healthProfile, setHealthProfile] = useState(null)
  const [plans, setPlans] = useState([])
  const [sessions, setSessions] = useState([])
  const [legacySessions, setLegacySessions] = useState([])
  const [sessionsTableMissing, setSessionsTableMissing] = useState(false)
  const [airQuality, setAirQuality] = useState(null)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activityName, setActivityName] = useState('')
  const [feeling, setFeeling] = useState('')
  const [activityNotes, setActivityNotes] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [form, setForm] = useState({ age: '', sex: 'unspecified', weight: '', height: '', days: '3', intensity: 'เบา', condition: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล')
      setLoading(false)
      return
    }
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) {
        setUserId('')
        setLoading(false)
        return
      }
      setUserId(user.id)
      const [profileResult, healthResult, assessmentResult, plansResult, sessionsResult] = await Promise.all([
        supabase.from('profiles').select('id,full_name,province,health_risk_group,has_completed_assessment').eq('id', user.id).maybeSingle(),
        supabase.from('health_profiles').select('chronic_condition').eq('user_id', user.id).maybeSingle(),
        supabase.from('risk_assessments').select('answers,score,red_flag,health_risk_group,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('health_plans').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('workout_sessions').select('*').eq('user_id', user.id).order('completed_at', { ascending: false }),
      ])
      for (const result of [profileResult, healthResult, assessmentResult, plansResult]) if (result.error) throw result.error
      const sessionTableUnavailable = sessionsResult.error?.code === '42P01' || sessionsResult.error?.code === 'PGRST205'
      if (sessionsResult.error && !sessionTableUnavailable) throw sessionsResult.error
      setProfile(profileResult.data)
      setHealthProfile(healthResult.data)
      setAssessment(assessmentResult.data)
      setPlans(plansResult.data ?? [])
      setSessionsTableMissing(sessionTableUnavailable)
      if (!sessionsResult.error) setSessions(sessionsResult.data ?? [])
      if (!profileResult.data?.province) setAirQuality(null)

      const currentPlan = (plansResult.data ?? [])[0]
      setForm((current) => ({
        ...current,
        age: currentPlan?.age ? String(currentPlan.age) : current.age,
        sex: currentPlan?.sex || current.sex,
        weight: currentPlan?.weight_kg ? String(currentPlan.weight_kg) : current.weight,
        height: currentPlan?.height_cm ? String(currentPlan.height_cm) : current.height,
        days: String(currentPlan?.days_per_week ?? 3),
        intensity: currentPlan?.intensity || 'เบา',
        condition: healthResult.data?.chronic_condition || currentPlan?.chronic_condition || '',
      }))
      try {
        const old = JSON.parse(localStorage.getItem('exercise-history') || '[]')
        setLegacySessions(Array.isArray(old) ? old : [])
      } catch {
        setLegacySessions([])
      }
      const setupStarted = localStorage.getItem(`exercise-plan-setup-started:${user.id}`) === 'true'
      if (!(plansResult.data ?? []).length && !setupStarted) setActiveTab('settings')
    } catch (loadError) {
      setError(loadError?.message || 'โหลดข้อมูลแผนไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => { if (active) void load() })
    return () => { active = false }
  }, [load])
  useEffect(() => {
    if (!profile?.province) return undefined
    let active = true
    computeProvinceAreas([], profile.province)
      .then((provinceAir) => {
        if (active) setAirQuality(getPersonalizedPm25Result(provinceAir.averagePm25, profile, assessment, healthProfile))
      })
      .catch(() => { if (active) setAirQuality(null) })
    return () => { active = false }
  }, [profile, assessment, healthProfile])
  useEffect(() => {
    if (!timerRunning) return undefined
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [timerRunning])

  const currentPlan = plans.find((plan) => plan.plan_status !== 'pending_rules') ?? null
  const pendingPlan = plans.find((plan) => plan.plan_status === 'pending_rules') ?? null
  const todayActivity = useMemo(() => {
    const today = new Date().toDateString()
    return sessions.filter((session) => new Date(session.completed_at).toDateString() === today)
  }, [sessions])
  const needsDoctor = assessment?.red_flag === true || profile?.health_risk_group === 'high_critical' || assessment?.health_risk_group === 'high_critical'

  function updateForm(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
    setMessage('')
  }

  function startSetup() {
    if (userId) localStorage.setItem(`exercise-plan-setup-started:${userId}`, 'true')
    setStep(0)
    setActiveTab('settings')
  }

  async function savePreferences(event) {
    event.preventDefault()
    if (!supabase || !userId) return
    setSaving(true)
    setMessage('')
    const sourceInputs = {
      age: form.age ? Number(form.age) : null,
      sex: form.sex,
      weight_kg: form.weight ? Number(form.weight) : null,
      height_cm: form.height ? Number(form.height) : null,
      chronic_condition: form.condition.trim() || healthProfile?.chronic_condition || null,
      risk_group: profile?.health_risk_group || assessment?.health_risk_group || null,
      red_flag: assessment?.red_flag === true,
      assessment_answers: assessment?.answers ?? null,
      age_group: assessment?.answers?.age ?? null,
      province: profile?.province || null,
    }
    try {
      const { error: saveError } = await supabase.from('health_plans').insert({
        user_id: userId,
        age: sourceInputs.age,
        sex: form.sex,
        weight_kg: sourceInputs.weight_kg,
        height_cm: sourceInputs.height_cm,
        days_per_week: Number(form.days),
        intensity: form.intensity,
        chronic_condition: sourceInputs.chronic_condition || 'ยังไม่ได้ระบุ',
        risk_group: sourceInputs.risk_group,
        province: sourceInputs.province,
        plan_status: 'pending_rules',
        rule_version: null,
        source_inputs: sourceInputs,
        plan_json: { status: 'pending_rules', schedule: null, preferences: { days_per_week: Number(form.days), intensity: form.intensity }, rule_version: null },
        updated_at: new Date().toISOString(),
      })
      if (saveError) throw saveError
      localStorage.setItem(`exercise-plan-setup-started:${userId}`, 'true')
      setMessage('บันทึกข้อมูลตั้งต้นแล้ว แต่ยังไม่สร้างตารางฝึกจนกว่าจะยืนยันหลักเกณฑ์ความปลอดภัย')
      await load()
      setActiveTab('today')
    } catch (saveError) {
      setMessage(saveError?.message || 'บันทึกข้อมูลไม่สำเร็จ ตรวจสอบว่าได้รันไฟล์ SQL migration แล้ว')
    } finally {
      setSaving(false)
    }
  }

  async function saveActivity(event) {
    event.preventDefault()
    if (!supabase || !userId || !activityName.trim() || elapsed <= 0) return
    setSaving(true)
    setMessage('')
    try {
      const { error: saveError } = await supabase.from('workout_sessions').insert({
        user_id: userId,
        health_plan_id: currentPlan?.id ?? null,
        activity_name: activityName.trim(),
        duration_seconds: elapsed,
        feeling: feeling || null,
        notes: activityNotes.trim() || null,
        completed_at: new Date().toISOString(),
      })
      if (saveError) throw saveError
      setActivityName('')
      setFeeling('')
      setActivityNotes('')
      setElapsed(0)
      setTimerRunning(false)
      setMessage('บันทึกกิจกรรมแล้ว')
      await load()
    } catch (saveError) {
      setMessage(saveError?.message || 'บันทึกกิจกรรมไม่สำเร็จ ตรวจสอบว่าได้รันไฟล์ SQL migration แล้ว')
    } finally {
      setSaving(false)
    }
  }

  function renderToday() {
    return <>
      <section className="eh-welcome"><p className="eh-eyebrow">{new Intl.DateTimeFormat('th-TH', { dateStyle: 'full' }).format(new Date())}</p><h2>วันนี้</h2><p>ดูแผนและบันทึกกิจกรรมของคุณ</p></section>
      {needsDoctor && <ErrorNotice>ผลประเมินมีสัญญาณความเสี่ยงสูง ควรปรึกษาแพทย์ก่อนเริ่มออกกำลังกาย</ErrorNotice>}
      {!currentPlan && <section className="eh-empty-card"><span className="eh-empty-icon" aria-hidden="true">＋</span><h3>{pendingPlan ? 'ข้อมูลตั้งต้นบันทึกแล้ว' : 'ยังไม่มีแผน'}</h3><p>{pendingPlan ? 'ตารางฝึกยังรอหลักเกณฑ์ที่ตรวจสอบได้ จึงยังไม่มีคำแนะนำให้ทำวันนี้' : 'ตั้งค่าข้อมูลสุขภาพและความต้องการเพื่อเริ่มต้น'}</p><button className="eh-primary" type="button" onClick={startSetup}>{pendingPlan ? 'ดูข้อมูลตั้งค่า' : 'ตั้งค่าแผน'}</button></section>}
      {currentPlan && <section className="eh-card"><h3>ข้อมูลแผนที่บันทึกไว้</h3><dl className="eh-facts"><div><dt>จำนวนวันที่เลือก</dt><dd>{currentPlan.days_per_week ?? '—'} วัน/สัปดาห์</dd></div><div><dt>ความหนักที่เลือกไว้</dt><dd>{display(currentPlan.intensity, '—')}</dd></div><div><dt>กลุ่มสุขภาพ</dt><dd>{display(currentPlan.risk_group, 'ยังไม่ระบุ')}</dd></div></dl><ErrorNotice>ยังไม่แสดงตารางฝึก เพราะยังขาดหลักเกณฑ์เรื่องวันพักและความหนักที่ตรวจสอบได้</ErrorNotice><button className="eh-secondary" type="button" onClick={() => setActiveTab('plan')}>ดูข้อมูลแผน</button></section>}
      <section className="eh-card"><header className="eh-card-heading"><div><h3>กิจกรรมที่บันทึกวันนี้</h3><p>แสดงเฉพาะรายการที่บันทึกไว้จริง</p></div><strong>{todayActivity.length}</strong></header>{todayActivity.length ? todayActivity.map((item) => <div className="eh-list-row" key={item.id}><span>{item.activity_name}</span><b>{durationLabel(item.duration_seconds)}</b></div>) : <p className="eh-muted">ยังไม่มีรายการกิจกรรมวันนี้</p>}</section>
      <p className="eh-safety"><strong>ความปลอดภัย:</strong> หยุดทันทีถ้าแน่นหน้าอก หายใจมีเสียงหวีด หรือเวียนศีรษะ <span>หากมีอาการรุนแรง โทร 1669</span></p>
    </>
  }

  function renderPlan() {
    if (!plans.length) return <section className="eh-empty-card"><h2>ยังไม่มีแผน</h2><p>เมื่อยืนยันหลักเกณฑ์ความปลอดภัยแล้วจึงสร้างตารางฝึกได้</p><button className="eh-primary" type="button" onClick={startSetup}>ตั้งค่าแผน</button></section>
    return <>
      <section className="eh-card"><h2>แผนของฉัน</h2>{plans.map((plan) => <article className="eh-plan-record" key={plan.id}><header><strong>{plan.plan_status === 'pending_rules' ? 'ข้อมูลตั้งต้น — รอหลักเกณฑ์' : 'แผนที่บันทึกไว้'}</strong><time>{formatDate(plan.created_at)}</time></header><dl className="eh-facts"><div><dt>ความถี่</dt><dd>{plan.days_per_week ?? '—'} วัน/สัปดาห์</dd></div><div><dt>ความหนัก</dt><dd>{display(plan.intensity, '—')}</dd></div><div><dt>รูปแบบกิจกรรม</dt><dd>{display(plan.exercise_type, '—')}</dd></div><div><dt>ระยะเวลาเดิม</dt><dd>{plan.duration_minutes ? `${plan.duration_minutes} นาที` : '—'}</dd></div><div><dt>ภาวะสุขภาพที่บันทึก</dt><dd>{display(plan.chronic_condition)}</dd></div><div><dt>จังหวัด</dt><dd>{display(plan.province)}</dd></div></dl>{Array.isArray(plan.plan_json?.exercises) && <p className="eh-muted">กิจกรรมในข้อมูลเดิม: {plan.plan_json.exercises.join(' · ')}</p>}{plan.plan_status === 'pending_rules' && <ErrorNotice>ยังไม่มีตารางรายวัน รอหลักเกณฑ์อ้างอิงก่อนสร้างแผน</ErrorNotice>}</article>)}</section>
    </>
  }

  function renderSettings() {
    return <section className="eh-card eh-settings"><p className="eh-eyebrow">ขั้นที่ {step + 1} จาก 3</p><h2>ตั้งค่าแผน</h2><div className="eh-stepper" aria-label={`ขั้นที่ ${step + 1} จาก 3`}>{['ร่างกาย', 'ความต้องการ', 'สุขภาพ'].map((label, index) => <span className={index === step ? 'is-current' : index < step ? 'is-done' : ''} key={label}>{label}</span>)}</div>
      {needsDoctor && <ErrorNotice>ผลประเมินมีสัญญาณความเสี่ยงสูง ควรปรึกษาแพทย์ก่อนเริ่มออกกำลังกาย ระบบจะไม่สร้างตารางฝึกให้ในตอนนี้</ErrorNotice>}
      {step === 0 && <div className="eh-form-grid"><p className="eh-muted eh-full">ข้อมูลจากแผนเดิมจะเติมให้ หากไม่มีข้อมูล ช่องเหล่านี้เว้นไว้ได้</p><label>อายุ (ปี)<input type="number" inputMode="numeric" value={form.age} onChange={(event) => updateForm('age', event.target.value)} /></label><label>เพศที่บันทึกไว้<select value={form.sex} onChange={(event) => updateForm('sex', event.target.value)}><option value="unspecified">ไม่ระบุ</option><option value="female">หญิง</option><option value="male">ชาย</option><option value="other">อื่น ๆ</option></select></label><label>น้ำหนัก (กก.)<input type="number" inputMode="decimal" step="0.1" value={form.weight} onChange={(event) => updateForm('weight', event.target.value)} /></label><label>ส่วนสูง (ซม.)<input type="number" inputMode="decimal" step="0.1" value={form.height} onChange={(event) => updateForm('height', event.target.value)} /></label></div>}
      {step === 1 && <div className="eh-form-grid"><p className="eh-muted eh-full">จำนวนวันและระดับด้านล่างเป็นความต้องการที่คุณเลือก ไม่ใช่คำแนะนำทางการแพทย์</p><label>จำนวนวันที่ต้องการ<select value={form.days} onChange={(event) => updateForm('days', event.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day} value={day}>{day} วัน/สัปดาห์</option>)}</select></label><label>ระดับที่ต้องการ<select value={form.intensity} onChange={(event) => updateForm('intensity', event.target.value)}><option>เบา</option><option>ปานกลาง</option><option>หนัก</option></select></label><p className="eh-notice eh-notice--warning eh-full">ค่าที่เลือกจะบันทึกเป็นความต้องการเท่านั้น ยังไม่นำไปสร้างตารางฝึกจนกว่าจะยืนยันกฎวันพักและความหนัก</p></div>}
      {step === 2 && <div className="eh-form-grid"><label className="eh-full">โรคประจำตัวที่บันทึกไว้<textarea rows="3" value={form.condition} onChange={(event) => updateForm('condition', event.target.value)} placeholder="ข้อมูลจาก health_profiles หรือระบุเพิ่มเติม" /></label><div className="eh-health-summary eh-full"><p><strong>ช่วงอายุจากแบบประเมิน:</strong> {display(assessment?.answers?.age)}</p><p><strong>กลุ่มสุขภาพ:</strong> {display(profile?.health_risk_group || assessment?.health_risk_group)}</p><p><strong>ผลประเมิน:</strong> {assessment ? `มีข้อมูลคะแนน ${display(assessment.score, '—')}${assessment.red_flag ? ' และมีสัญญาณที่ควรระวัง' : ''}` : 'ยังไม่มีข้อมูลแบบประเมิน'}</p><p><strong>จังหวัดโปรไฟล์:</strong> {display(profile?.province)}</p></div><ErrorNotice>ยังขาดกฎอ้างอิงสำหรับจำนวนวันพักติดกัน ระยะเวลา ความหนัก และคำแนะนำตามค่าฝุ่น จึงบันทึกได้เฉพาะข้อมูลตั้งต้น</ErrorNotice></div>}
      {message && <p className="eh-notice" role="status">{message}</p>}
      <div className="eh-actions">{step > 0 && <button className="eh-secondary" type="button" onClick={() => setStep((value) => value - 1)}>ย้อนกลับ</button>}{step < 2 ? <button className="eh-primary" type="button" onClick={() => setStep((value) => value + 1)}>{step === 0 ? 'ถัดไป' : 'ตรวจข้อมูล'}</button> : <button className="eh-primary" type="button" disabled={saving || !userId} onClick={savePreferences}>{saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูลตั้งต้น'}</button>}</div>
      </section>
  }

  function renderActivity() {
    return <section className="eh-card"><h2>ทำกิจกรรม</h2><p className="eh-muted">บันทึกกิจกรรมที่คุณทำจริง ระบบจับเวลาให้และไม่สร้างผลลัพธ์แทนคุณ</p><p className="eh-safety"><strong>หยุดทันทีถ้าแน่นหน้าอก หายใจมีเสียงหวีด หรือเวียนศีรษะ</strong></p><form className="eh-form-grid" onSubmit={saveActivity}><label className="eh-full">กิจกรรมที่ทำ<input required value={activityName} onChange={(event) => setActivityName(event.target.value)} placeholder="ระบุสิ่งที่คุณกำลังทำ" /></label><div className="eh-timer eh-full" role="timer" aria-live="off">{durationLabel(elapsed)}</div><div className="eh-actions eh-full"><button className="eh-secondary" type="button" onClick={() => setTimerRunning((value) => !value)} disabled={!activityName.trim()}>{timerRunning ? 'หยุดชั่วคราว' : elapsed ? 'เริ่มต่อ' : 'เริ่มจับเวลา'}</button><button className="eh-secondary" type="button" onClick={() => { setElapsed(0); setTimerRunning(false) }}>เริ่มใหม่</button></div><label>ความรู้สึกหลังทำ<select value={feeling} onChange={(event) => setFeeling(event.target.value)}><option value="">เลือกได้</option><option value="สบายดี">สบายดี</option><option value="เหนื่อย">เหนื่อย</option><option value="ไม่สบาย">ไม่สบาย</option></select></label><label className="eh-full">บันทึกเพิ่มเติม<textarea rows="3" value={activityNotes} onChange={(event) => setActivityNotes(event.target.value)} /></label><button className="eh-primary eh-full" type="submit" disabled={saving || timerRunning || elapsed <= 0 || !activityName.trim()}>{saving ? 'กำลังบันทึก…' : 'บันทึกกิจกรรมที่ทำแล้ว'}</button></form>{message && <p className="eh-notice" role="status">{message}</p>}{sessionsTableMissing && <ErrorNotice>ยังบันทึกประวัติลงฐานข้อมูลไม่ได้ กรุณารัน migration ที่แนบก่อน</ErrorNotice>}</section>
  }

  function renderHistory() {
    const oldRows = legacySessions.map((item, index) => ({ id: `local-${index}`, activity_name: item.exercise, duration_seconds: item.seconds, feeling: '', notes: item.note, completed_at: item.completedAt, local: true }))
    const rows = [...sessions.map((item) => ({ ...item, local: false })), ...oldRows].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
    return <section className="eh-card"><h2>ประวัติกิจกรรม</h2>{sessionsTableMissing && <ErrorNotice>ตารางประวัติในฐานข้อมูลยังไม่พร้อม รายการเดิมในอุปกรณ์ยังคงเก็บไว้</ErrorNotice>}{rows.length ? <div className="eh-history-list">{rows.map((item) => <article className="eh-history-item" key={item.id}><header><strong>{item.activity_name}</strong><time>{formatDate(item.completed_at)}</time></header><p>{durationLabel(item.duration_seconds)}</p>{item.feeling && <p>ความรู้สึก: {item.feeling}</p>}{item.notes && <p>{item.notes}</p>}{item.local && <small>บันทึกเดิมในอุปกรณ์นี้</small>}</article>)}</div> : <div className="eh-empty-card"><h3>ยังไม่มีประวัติกิจกรรม</h3><p>กิจกรรมที่คุณบันทึกจะปรากฏที่นี่</p></div>}</section>
  }

  const renderTab = { today: renderToday, activity: renderActivity, plan: renderPlan, history: renderHistory, settings: renderSettings }[activeTab]

  if (loading) return <main className="eh-page"><p className="eh-loading" role="status">กำลังโหลดข้อมูลสุขภาพและแผน…</p></main>

  return <main className="eh-page">
    <header className="eh-header"><div className="eh-brand"><span className="eh-brand-mark" aria-hidden="true">＋</span><span>แผนการออกกำลังกาย</span></div></header>
    <div className="eh-layout">
      <nav className="eh-side-nav" aria-label="เมนูแผนการออกกำลังกาย">{tabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}><span aria-hidden="true">{tab.icon}</span>{tab.label}</button>)}</nav>
      <section className="eh-main" id="main" aria-live="polite"><div className="eh-main-heading"><div><p className="eh-eyebrow">พื้นที่ส่วนตัว</p><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1></div><button className="eh-refresh" type="button" onClick={load} disabled={loading}>โหลดข้อมูลใหม่</button></div>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {!userId ? <section className="eh-empty-card"><h2>เข้าสู่ระบบเพื่อดูข้อมูลของคุณ</h2><p>แผนและประวัติออกกำลังกายจะแสดงเฉพาะบัญชีที่เข้าสู่ระบบ</p></section> : renderTab()}
      </section>
      <aside className="eh-aside"><section className="eh-aside-card"><p className="eh-eyebrow">ข้อมูลสุขภาพของคุณ</p><h2>{display(profile?.province, 'ยังไม่ได้ระบุจังหวัด')}</h2><p>กลุ่มสุขภาพ: {display(profile?.health_risk_group || assessment?.health_risk_group)}</p><p>ภาวะสุขภาพ: {display(healthProfile?.chronic_condition)}</p><p>ฝุ่น PM2.5 ในจังหวัด: {airQuality?.tier ? airQuality.tier.label_th : 'รอข้อมูลจริง'}</p><p>คำแนะนำกิจกรรมกลางแจ้ง: รอหลักเกณฑ์ที่ตรวจสอบได้</p></section><section className="eh-aside-card eh-guideline-card"><h3>หลักเกณฑ์ที่รอยืนยัน</h3><ul>{pendingRuleNotes.map((note) => <li key={note}>{note}</li>)}</ul><small>ยังไม่สร้างคำแนะนำออกกำลังกายจนกว่าจะมีแหล่งอ้างอิงที่ตรวจสอบได้</small></section><section className="eh-aside-card"><strong>ความปลอดภัย</strong><p>หยุดทันทีถ้าแน่นหน้าอก หายใจมีเสียงหวีด หรือเวียนศีรษะ</p><p>กรณีฉุกเฉิน โทร 1669</p></section></aside>
    </div>
    <nav className="eh-mobile-tabs" aria-label="เมนูแผนการออกกำลังกาย">{tabs.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? 'is-active' : ''} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}><span aria-hidden="true">{tab.icon}</span><span>{tab.label}</span></button>)}</nav>
  </main>
}
