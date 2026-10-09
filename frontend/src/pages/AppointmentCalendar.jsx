import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const pad = (value) => String(value).padStart(2, '0')
const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const localDate = (key) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const todayKey = () => keyOf(new Date())
const dateLabel = (key) => new Intl.DateTimeFormat('th-TH', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(localDate(key))
const monthLabel = (date) => new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(date)

function fromDatabase(record) {
  const appointmentDate = new Date(record.appointment_at)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(appointmentDate)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(appointmentDate).split(':')
  return {
    id: record.id,
    symptoms: record.symptoms ?? '',
    clinician: record.provider ?? '',
    contact: record.contact_value ?? '',
    date: `${values.year}-${values.month}-${values.day}`,
    hour: time[0],
    minute: time[1],
    notes: record.notes ?? '',
    urgency: record.urgency ?? '',
  }
}

function toDatabaseTimestamp(date, hour, minute) {
  return new Date(`${date}T${hour}:${minute}:00+07:00`).toISOString()
}

const urgencyOptions = [
  { id: 'critical', label: 'ด่วนที่สุด', icon: '‼', className: 'urgent-red' },
  { id: 'urgent', label: 'ด่วน', icon: '!', className: 'urgent-orange' },
  { id: 'soon', label: 'ใกล้ถึง', icon: '◷', className: 'urgent-yellow' },
  { id: 'normal', label: 'รอนัด', icon: '◷', className: 'urgent-green' },
]
const unspecifiedUrgency = { id: '', label: 'ยังไม่ได้ระบุ', icon: '—', className: 'urgent-unset' }
const getUrgency = (id) => urgencyOptions.find((option) => option.id === id) ?? unspecifiedUrgency
const hours = Array.from({ length: 24 }, (_, index) => pad(index))
const minutes = Array.from({ length: 12 }, (_, index) => pad(index * 5))
const blankForm = (date = todayKey()) => ({ symptoms: '', clinician: '', contact: '', date, hour: '', minute: '', notes: '' })

function suggestUrgency(date, referenceDay = todayKey()) {
  const [todayYear, todayMonth, todayDay] = referenceDay.split('-').map(Number)
  const [year, month, day] = date.split('-').map(Number)
  const today = Date.UTC(todayYear, todayMonth - 1, todayDay)
  const selected = Date.UTC(year, month - 1, day)
  const daysLeft = Math.round((selected - today) / 86400000)
  if (daysLeft <= 1) return 'critical'
  if (daysLeft === 2) return 'urgent'
  if (daysLeft <= 4) return 'soon'
  return 'normal'
}

// Derive the displayed urgency from the appointment date, not its saved value,
// so existing appointments change status as the appointment gets closer.
const getAppointmentUrgency = (appointment, referenceDay = todayKey()) => getUrgency(suggestUrgency(appointment.date, referenceDay))

function Calendar({ month, selected, appointments, today, onSelect, onChangeMonth }) {
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return Array.from({ length: 42 }, (_, index) => {
      const day = index - first.getDay() + 1
      return day > 0 && day <= count ? new Date(month.getFullYear(), month.getMonth(), day) : null
    })
  }, [month])
  const byDate = useMemo(() => appointments.reduce((map, item) => {
    const list = map.get(item.date) ?? []
    list.push(item)
    map.set(item.date, list)
    return map
  }, new Map()), [appointments])

  return (
    <section className="appointment-calendar-card" aria-label="ปฏิทินนัดหมาย">
      <div className="appointment-calendar-monthbar">
        <button type="button" className="appointment-month-arrow" onClick={() => onChangeMonth(-1)} aria-label="เดือนก่อนหน้า">‹</button>
        <h2>{monthLabel(month)}</h2>
        <button type="button" className="appointment-month-arrow" onClick={() => onChangeMonth(1)} aria-label="เดือนถัดไป">›</button>
      </div>
      <div className="appointment-weekdays" aria-hidden="true">
        {['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="appointment-days-grid">
        {days.map((date, index) => {
          const dateKey = date && keyOf(date)
          const dayItems = dateKey ? (byDate.get(dateKey) ?? []).sort((a, b) => `${a.hour}:${a.minute}`.localeCompare(`${b.hour}:${b.minute}`)) : []
          const classes = [
            'appointment-day',
            !date ? 'is-outside' : '',
            dateKey === today ? 'is-today' : '',
            dateKey === selected ? 'is-selected' : '',
            dayItems.length ? 'has-appointments' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={index}
              type="button"
              disabled={!date}
              className={classes}
              aria-label={date ? `${dateLabel(dateKey)}${dayItems.length ? ` มีนัด ${dayItems.length} รายการ` : ''}${dateKey === today ? ' วันนี้' : ''}${dateKey === selected ? ' วันที่เลือก' : ''}` : undefined}
              aria-pressed={dateKey === selected}
              onClick={(event) => date && onSelect(dateKey, event.currentTarget)}
            >
              {date && <>
                <span className="appointment-day-number">{date.getDate()}</span>
                {dateKey === today && <span className="appointment-today-label">วันนี้</span>}
                {dayItems.length > 0 && <span className="appointment-day-items">
                  {dayItems.slice(0, 1).map((item) => {
                    const urgency = getAppointmentUrgency(item)
                    return <span key={item.id} className={`appointment-day-chip ${urgency.className}`} title={`${urgency.label} · ${item.hour}:${item.minute} ${item.symptoms}`}>
                      <span aria-hidden="true">{urgency.icon}</span> <span className="appointment-day-urgency">{urgency.label}</span> · {item.hour}:{item.minute} {item.symptoms}
                    </span>
                  })}
                  {dayItems.length > 1 && <span className="appointment-more-count">+{dayItems.length - 1} นัด</span>}
                </span>}
              </>}
            </button>
          )
        })}
      </div>
      <div className="appointment-legend" aria-label="คำอธิบายระดับความเร่งด่วน">
        {urgencyOptions.map((option) => <span className={`appointment-legend-item ${option.className}`} key={option.id}>
          <span aria-hidden="true">{option.icon}</span><span>{option.label}</span>
        </span>)}
      </div>
      <p className="appointment-calendar-hint">วันนี้มีกรอบเขียว · วันที่เลือกมีพื้นเขียว · นัดหมายแสดงตามสีและข้อความความเร่งด่วน</p>
    </section>
  )
}

export default function AppointmentCalendar() {
  const navigate = useNavigate()
  const [currentDay, setCurrentDay] = useState(todayKey)
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selected, setSelected] = useState(todayKey())
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(() => blankForm())
  const [errors, setErrors] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toast, setToast] = useState('')
  const symptomsInputRef = useRef(null)
  const returnFocusRef = useRef(null)

  const loadAppointments = useCallback(async () => {
    if (!supabase) {
      setLoadError('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('กรุณาเข้าสู่ระบบเพื่อดูนัดหมายของคุณ')
      const { data, error } = await supabase
        .from('health_appointments')
        .select('id,user_id,symptoms,status,appointment_at,provider,contact_value,notes,urgency')
        .eq('user_id', user.id)
        .eq('status', 'scheduled')
        .order('appointment_at', { ascending: true })
      if (error) throw error
      setAppointments((data ?? []).map(fromDatabase))
    } catch (error) {
      setLoadError(error?.message || 'โหลดนัดหมายไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => { if (active) void loadAppointments() })
    return () => { active = false }
  }, [loadAppointments])

  useEffect(() => {
    let timer
    const refreshAtMidnight = () => {
      setCurrentDay(todayKey())
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = window.setTimeout(refreshAtMidnight, nextMidnight.getTime() - now.getTime())
    }
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    timer = window.setTimeout(refreshAtMidnight, nextMidnight.getTime() - now.getTime())
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (formOpen) symptomsInputRef.current?.focus()
  }, [formOpen])

  useEffect(() => {
    if (!formOpen && !deleteTarget) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (formOpen) {
          setFormOpen(false)
          setEditingId(null)
          window.setTimeout(() => returnFocusRef.current?.focus(), 0)
        } else {
          setDeleteTarget(null)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [formOpen, deleteTarget])

  const selectedAppointments = useMemo(() => appointments
    .filter((item) => item.date === selected)
    .sort((a, b) => `${a.hour}:${a.minute}`.localeCompare(`${b.hour}:${b.minute}`)), [appointments, selected])

  function openForm(date = selected, anchor = null, appointment = null) {
    returnFocusRef.current = anchor
    setSelected(date)
    setMonth(new Date(localDate(date).getFullYear(), localDate(date).getMonth(), 1))
    setEditingId(appointment?.id ?? null)
    setForm(appointment ? { ...appointment } : blankForm(date))
    setErrors({})
    setFormError('')
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    window.setTimeout(() => returnFocusRef.current?.focus(), 0)
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
    setErrors((current) => ({ ...current, [field]: '' }))
  }

  function validate() {
    const next = {}
    if (!form.symptoms.trim()) next.symptoms = 'กรุณากรอกอาการที่ติดตาม'
    if (!form.date) next.date = 'กรุณาเลือกวันที่นัดหมาย'
    else if (form.date < todayKey()) next.date = 'เลือกวันนี้หรือวันข้างหน้าได้เท่านั้น'
    if (!form.hour || !form.minute) next.time = 'กรุณาเลือกเวลานัดหมาย'
    if (form.contact.trim()) {
      const contact = form.contact.trim()
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
      const validPhone = /^\+?[\d\s()-]{8,20}$/.test(contact) && /\d/.test(contact)
      if (!validEmail && !validPhone) next.contact = 'กรุณาตรวจเบอร์โทรหรืออีเมลอีกครั้ง'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function saveAppointment(event) {
    event.preventDefault()
    if (!validate() || !supabase) return
    setSaving(true)
    setLoadError('')
    setFormError('')
    const wasEditing = Boolean(editingId)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึกนัดหมาย')
      const record = {
        user_id: user.id,
        symptoms: form.symptoms.trim(),
        provider: form.clinician.trim() || null,
        contact_value: form.contact.trim() || null,
        appointment_at: toDatabaseTimestamp(form.date, form.hour, form.minute),
        notes: form.notes.trim() || null,
        urgency: suggestUrgency(form.date),
        status: 'scheduled',
      }
      const result = editingId
        ? await supabase.from('health_appointments').update(record).eq('id', editingId).eq('user_id', user.id)
        : await supabase.from('health_appointments').insert(record)
      if (result.error) throw result.error
      await loadAppointments()
      setSelected(form.date)
      setMonth(new Date(localDate(form.date).getFullYear(), localDate(form.date).getMonth(), 1))
      closeForm()
      setToast(wasEditing ? 'แก้ไขนัดหมายเรียบร้อยแล้ว' : 'บันทึกนัดหมายลงฐานข้อมูลแล้ว')
      window.setTimeout(() => setToast(''), 4500)
    } catch (error) {
      setFormError(error?.message || 'บันทึกนัดหมายไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  async function deleteAppointment() {
    if (!deleteTarget) return
    if (!supabase) return
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนลบนัดหมาย')
      const { error } = await supabase.from('health_appointments').delete()
        .eq('id', deleteTarget.id).eq('user_id', user.id)
      if (error) throw error
      await loadAppointments()
      setDeleteTarget(null)
      setToast('ลบนัดหมายเรียบร้อยแล้ว')
      window.setTimeout(() => setToast(''), 4500)
    } catch (error) {
      setLoadError(error?.message || 'ลบนัดหมายไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  return (
    <main className="appointment-calendar-page">
      {toast && <div className="appointment-feedback" role="status"><span aria-hidden="true">✓</span>{toast}<button type="button" onClick={() => setToast('')} aria-label="ปิดข้อความ">×</button></div>}
      <header className="appointment-calendar-header">
        <button className="appointment-back-button" type="button" onClick={() => navigate('/')}><span aria-hidden="true">←</span> กลับหน้าหลัก</button>
        <div className="appointment-heading-row">
          <div><p className="appointment-eyebrow">สุขภาพของฉัน</p><h1>ปฏิทินนัดหมาย</h1><p>เลือกวันที่เพื่อดูหรือเพิ่มนัดหมาย</p></div>
      <button className="appointment-header-add" type="button" onClick={(event) => openForm(selected, event.currentTarget)}>＋ เพิ่มนัดหมาย</button>
        </div>
      </header>

      <div className="appointment-calendar-layout">
        {loadError && <div className="appointment-db-error" role="alert"><span>{loadError}</span><button type="button" onClick={loadAppointments}>โหลดข้อมูลใหม่</button></div>}
        <Calendar
          month={month}
          selected={selected}
          appointments={appointments}
          today={currentDay}
          onSelect={(date, anchor) => {
            setSelected(date)
            const hasAppointment = appointments.some((item) => item.date === date)
            if (!loading && !hasAppointment) openForm(date, anchor)
          }}
          onChangeMonth={(offset) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))}
        />
        <aside className="appointment-panel" aria-labelledby="appointment-selected-date">
          <p className="appointment-panel-kicker">วันที่เลือก</p>
          <h2 id="appointment-selected-date">{dateLabel(selected)}</h2>
          <div className="appointment-panel-rule" />
          {loading ? <p className="appointment-loading" role="status">กำลังโหลดนัดหมายจากฐานข้อมูล…</p> : selectedAppointments.length ? <div className="appointment-selected-list">
            {selectedAppointments.map((item) => {
              const urgency = getAppointmentUrgency(item, currentDay)
              return <article className={`appointment-detail-card ${urgency.className}`} key={item.id}>
                <div className="appointment-detail-head"><span className="appointment-detail-time">{item.hour}:{item.minute}</span><span className={`appointment-urgency-pill ${urgency.className}`}><span aria-hidden="true">{urgency.icon}</span> {urgency.label}</span></div>
                <h3>{item.symptoms}</h3>
                <dl>
                  <div><dt>อาการที่ติดตาม</dt><dd>{item.symptoms}</dd></div>
                  <div><dt>แพทย์หรือพยาบาล</dt><dd>{item.clinician || 'ไม่ได้ระบุ'}</dd></div>
                  <div><dt>ติดต่อ</dt><dd>{item.contact || 'ไม่ได้ระบุ'}</dd></div>
                  <div><dt>วันและเวลา</dt><dd>{dateLabel(item.date)} เวลา {item.hour}:{item.minute} น.</dd></div>
                  <div><dt>รายละเอียดเพิ่มเติม</dt><dd>{item.notes || 'ไม่ได้ระบุ'}</dd></div>
                  <div><dt>ความเร่งด่วน</dt><dd>{urgency.icon} {urgency.label}</dd></div>
                </dl>
                <div className="appointment-card-actions">
                  <button type="button" className="appointment-edit-button" onClick={(event) => openForm(item.date, event.currentTarget, item)}>แก้ไข</button>
                  <button type="button" className="appointment-delete-button" onClick={() => setDeleteTarget(item)}>ลบ</button>
                </div>
              </article>
            })}
          </div> : <div className="appointment-empty-state"><span className="appointment-empty-icon" aria-hidden="true">＋</span><strong>{selected === todayKey() ? 'วันนี้ยังไม่มีนัดหมาย' : 'วันที่เลือกยังไม่มีนัดหมาย'}</strong><p>เพิ่มนัดหมายแรกของคุณได้เลย</p></div>}
          <button className="appointment-add-button" type="button" onClick={(event) => openForm(selected, event.currentTarget)}>＋ เพิ่มนัดหมาย</button>
          <p className="appointment-temporary-note">นัดหมายนี้บันทึกในบัญชีของคุณและจะแสดงเมื่อเข้าสู่ระบบ</p>
        </aside>
      </div>

      {formOpen && <div className="appointment-form-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}>
        <section
          className="appointment-form-popover"
          role="dialog"
          aria-modal="true"
          aria-labelledby="appointment-form-title"
        >
          <button className="appointment-form-close" type="button" onClick={closeForm} aria-label="ปิดแบบฟอร์ม">×</button>
          <p className="appointment-form-kicker">{editingId ? 'แก้ไขข้อมูล' : 'เพิ่มรายการใหม่'}</p>
          <h2 id="appointment-form-title">{editingId ? 'แก้ไขนัดหมาย' : 'เพิ่มนัดหมาย'}</h2>
          <p className="appointment-form-date">{dateLabel(form.date)}</p>
          {formError && <div className="appointment-db-error" role="alert">บันทึกข้อมูลไม่สำเร็จ: {formError}</div>}
          <form className="appointment-form-grid" onSubmit={saveAppointment} noValidate>
            <label className="appointment-field appointment-field-wide" htmlFor="appointment-symptoms">อาการที่ติดตาม <span className="appointment-required">* (จำเป็น)</span>
              <input ref={symptomsInputRef} id="appointment-symptoms" value={form.symptoms} onChange={(event) => updateForm('symptoms', event.target.value)} aria-invalid={Boolean(errors.symptoms)} aria-describedby={errors.symptoms ? 'appointment-symptoms-error' : undefined} placeholder="เช่น อาการที่ต้องการปรึกษา" />
              {errors.symptoms && <small id="appointment-symptoms-error" className="appointment-input-error" role="alert">{errors.symptoms}</small>}
            </label>
            <label className="appointment-field" htmlFor="appointment-clinician">ชื่อแพทย์หรือพยาบาล <span>(ถ้ามี)</span>
              <input id="appointment-clinician" value={form.clinician} onChange={(event) => updateForm('clinician', event.target.value)} placeholder="ชื่อผู้ดูแล" />
            </label>
            <label className="appointment-field" htmlFor="appointment-contact">เบอร์โทรหรืออีเมล <span>(ถ้ามี)</span>
              <input id="appointment-contact" value={form.contact} onChange={(event) => updateForm('contact', event.target.value)} aria-invalid={Boolean(errors.contact)} aria-describedby={errors.contact ? 'appointment-contact-error' : undefined} placeholder="สำหรับติดต่อ" />
              {errors.contact && <small id="appointment-contact-error" className="appointment-input-error" role="alert">{errors.contact}</small>}
            </label>
            <label className="appointment-field" htmlFor="appointment-date">วันที่นัดหมาย <span className="appointment-required">* (จำเป็น)</span>
              <input id="appointment-date" type="date" min={todayKey()} value={form.date} onChange={(event) => updateForm('date', event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'appointment-date-error' : undefined} />
              {errors.date && <small id="appointment-date-error" className="appointment-input-error" role="alert">{errors.date}</small>}
            </label>
            <fieldset className="appointment-field appointment-time-field">
              <legend>เวลานัดหมาย <span className="appointment-required">* (จำเป็น)</span></legend>
              <div className="appointment-time-controls">
                <label htmlFor="appointment-hour"><span>ชั่วโมง</span><select id="appointment-hour" required value={form.hour} onChange={(event) => updateForm('hour', event.target.value)}><option value="" disabled>เลือก</option>{hours.map((hour) => <option key={hour} value={hour}>{hour}</option>)}</select></label>
                <span aria-hidden="true" className="appointment-time-colon">:</span>
                <label htmlFor="appointment-minute"><span>นาที</span><select id="appointment-minute" required value={form.minute} onChange={(event) => updateForm('minute', event.target.value)}><option value="" disabled>เลือก</option>{minutes.map((minute) => <option key={minute} value={minute}>{minute}</option>)}</select></label>
              </div>
              {errors.time && <small className="appointment-input-error" role="alert">{errors.time}</small>}
            </fieldset>
            <label className="appointment-field appointment-field-wide" htmlFor="appointment-notes">รายละเอียดเพิ่มเติม <span>(ถ้ามี)</span>
              <textarea id="appointment-notes" rows="2" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="ข้อมูลที่อยากจำ" />
            </label>
            <div className="appointment-form-actions appointment-field-wide">
              <button type="button" className="appointment-form-cancel" onClick={closeForm}>ยกเลิก</button>
              <button type="submit" className="appointment-form-save" disabled={saving}>{saving ? 'กำลังบันทึก…' : editingId ? 'บันทึกการแก้ไข' : 'บันทึกนัดหมาย'}</button>
            </div>
          </form>
        </section>
      </div>}

      {deleteTarget && <div className="appointment-confirm-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null) }}>
        <section className="appointment-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="appointment-delete-title">
          <span className="appointment-confirm-icon" aria-hidden="true">!</span>
          <h2 id="appointment-delete-title">ต้องการลบนัดหมายนี้ใช่หรือไม่</h2>
          <p>{dateLabel(deleteTarget.date)} เวลา {deleteTarget.hour}:{deleteTarget.minute} น.</p>
          <div className="appointment-form-actions"><button type="button" className="appointment-form-cancel" onClick={() => setDeleteTarget(null)}>ไม่ลบ</button><button type="button" className="appointment-confirm-delete" onClick={deleteAppointment}>ลบนัดหมาย</button></div>
        </section>
      </div>}
    </main>
  )
}
