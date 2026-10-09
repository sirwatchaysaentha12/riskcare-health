import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPersonalizedAudience } from '../utils/personalizedPm25'
import { UNIQUE_THAI_PROVINCES } from '../data/thaiProvinces'

const API_URL = '/api/air-quality/province-forecast'

const thDate = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(`${iso}T00:00:00+07:00`))

export default function ProvinceForecast() {
  const navigate = useNavigate()
  const [province, setProvince] = useState('')
  const [profileProvince, setProfileProvince] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [isSensitive, setIsSensitive] = useState(false)
  // loading มาจาก state ปัจจุบัน (ไม่ set ใน effect) — ขณะรอ fetch: มี province แต่ยังไม่มี data/error
  // คำนวณหลังประกาศ state ทั้งหมด (ด้านล่าง)

  // จังหวัดเริ่มต้นจากโปรไฟล์ (ครั้งเดียว) + กลุ่มสุขภาพ (threshold/คำแนะนำชุดเดิม)
  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('profiles').select('province,health_risk_group,has_completed_assessment').maybeSingle(),
      supabase.from('risk_assessments').select('answers, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('health_profiles').select('chronic_condition, medication').maybeSingle(),
    ]).then(([profile, assessment, healthProfile]) => {
      if (!active) return
      const prov = profile.data?.province
      if (prov) { setProfileProvince(prov); setProvince((cur) => cur || prov) }
      const audience = getPersonalizedAudience(profile.data, assessment.data, healthProfile.data)
      setIsSensitive(audience.audience === 'sensitive')
    }).catch(() => { /* ใช้ค่าทั่วไป */ })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!province) return
    let active = true
    const controller = new AbortController()
    fetch(`${API_URL}?province=${encodeURIComponent(province)}&risk=${isSensitive ? 'sensitive' : 'general'}`, { cache: 'no-store', signal: controller.signal })
      .then(async (res) => ({ status: res.status, ok: res.ok, payload: await res.json().catch(() => null) }))
      .then(({ status, ok, payload }) => {
        if (!active) return
        if (!ok || !payload || typeof payload !== 'object') throw new Error(payload?.message || `HTTP ${status}`)
        setData(payload)
      })
      .catch((err) => { if (active && err?.name !== 'AbortError') setError(err?.message || 'เชื่อมต่อไม่สำเร็จ') })
    return () => { active = false; controller.abort() }
  }, [province, retry, isSensitive])

  // retry/เปลี่ยนจังหวัด เป็น event handler — setState ที่นี่ได้ตามกฎ react-hooks
  const onProvinceChange = useCallback((value) => { setData(null); setError(null); setProvince(value) }, [])
  const retryNow = useCallback(() => { setData(null); setError(null); setRetry((v) => v + 1) }, [])

  const loading = Boolean(province) && !data && !error

  return (
    <main className="aq-page">
      <div className="aq-shell">
        <button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button>

        <section className="aq-card">
          <h1 className="aq-title">ค่าฝุ่นล่วงหน้า</h1>
          <p className="aq-subtitle">ค่าอ้างอิง PM2.5 รายจังหวัด +1/+2/+3 วัน จากค่าจริงล่าสุดของจังหวัด</p>
          <label className="pf-province-label" htmlFor="pf-province">จังหวัด
            <select id="pf-province" className="pf-province-select" value={province} onChange={(e) => onProvinceChange(e.target.value)}>
              <option value="">เลือกจังหวัด</option>
              {UNIQUE_THAI_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {profileProvince && province === profileProvince && <p className="pf-from-profile">จากโปรไฟล์ของคุณ</p>}
        </section>

        {!province && (
          <section className="aq-card"><div className="aq-empty-state"><strong>เลือกจังหวัดเพื่อดูค่าฝุ่นล่วงหน้า</strong><span>ระบบจะเริ่มจากจังหวัดในโปรไฟล์ของคุณโดยอัตโนมัติ</span></div></section>
        )}

        {province && loading && (
          <section className="aq-card"><div className="aq-empty-state"><strong>กำลังโหลดข้อมูล...</strong></div></section>
        )}

        {province && !loading && error && (
          <section className="aq-card"><div className="aq-empty-state">
            <strong>เกิดข้อผิดพลาด</strong><span>{error}</span>
            <button type="button" className="aq-retry" onClick={retryNow}>ลองใหม่</button>
          </div></section>
        )}

        {province && !loading && !error && data && data.state === 'unsupported' && (
          <section className="aq-card"><div className="aq-empty-state">
            <strong>จังหวัดนี้ยังไม่รองรับการพยากรณ์</strong>
            <span>{data.message}</span>
            <span>ระบบจะแสดงเฉพาะจังหวัดที่มีสถานีวัดในข้อมูลฝึกของโมเดล — ดูค่าฝุ่นจริงปัจจุบันได้ที่หน้าแนวโน้ม</span>
          </div></section>
        )}

        {province && !loading && !error && data && data.state === 'no_data' && (
          <section className="aq-card"><div className="aq-empty-state">
            <strong>ยังไม่มีผลพยากรณ์</strong>
            <span>{data.message}</span>
            <button type="button" className="aq-retry" onClick={retryNow}>ลองใหม่</button>
          </div></section>
        )}

        {province && !loading && !error && data && (data.state === 'ok' || data.state === 'stale') && (
          <>
            {data.state === 'stale' && (
              <section className="aq-card hf-stale" role="status">
                ⏳ {data.message || 'ข้อมูลพยากรณ์เก่า'}
                {data.updatedLabel && <span className="pf-age"> — อัปเดตล่าสุด {data.updatedLabel}</span>}
              </section>
            )}
            <section className="aq-card">
              <div className="pf-cards">
                {(data.items || []).map((item) => {
                  const status = item.status || { level: '—', advice: 'รอข้อมูล' }
                  const ready = item.forecastReady !== false
                  return (
                    <div key={item.targetDate} className={`pf-card pf-${item.horizon}${!ready ? ' pf-card-not-ready' : ''}`}>
                      <span className="pf-card-h">+{item.horizon} วัน</span>
                      <span className="pf-card-date">{thDate(item.targetDate)}</span>
                      {ready ? (
                        <>
                          <span className="pf-card-value">{item.pm25}<small> µg/m³</small></span>
                          <span className="pf-card-level">{status.level}</span>
                          <p className="pf-card-advice">{status.advice}</p>
                          {item.ageDays > 0 && <b className="pf-issued">ออกเมื่อ {thDate(item.issuedDate)}</b>}
                          <b className="aq-badge aq-badge-forecast">{data.modelVersion === 'persistence-baseline' ? 'ค่าอ้างอิง' : 'คาดการณ์'}</b>
                        </>
                      ) : (
                        <>
                          <span className="pf-card-not-ready-label">ยังไม่พร้อม</span>
                          <p className="pf-card-advice">{item.notReadyMessage || 'กำลังประเมินความแม่นยำ'}</p>
                          {/* แสดง trend 7 วัน ถ้ามี */}
                          {data.trend7d?.length > 0 && (
                            <p className="pf-trend-label">แนวโน้ม 7 วัน: {data.trend7d.slice(-1)[0]?.pm25?.toFixed(1)} µg/m³</p>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
            <section className="aq-card pf-meta">
              <p>{data.forecastLabel || `พยากรณ์โดยโมเดล ${data.modelVersion || 'ไม่ระบุ'}`}</p>
              <p className="pf-updated">อัปเดตล่าสุด {new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(data.updatedAt))} น.</p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
