import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/icons'
import { supabase } from '../lib/supabase'
import { UNIQUE_THAI_PROVINCES } from '../data/thaiProvinces'
import { getAqiStatus, pm25ToAqi } from '../utils/aqiStatus'
import { computeProvinceAreas } from '../utils/provinceAirQuality'
import { getPm25Tier, PRIMARY_PM25_THRESHOLD_SET_ID } from '../data/pm25Thresholds'
import {
  getClinicalGuidancePlaceholder,
  getPersonalizedPm25Result,
  getPersonalizedRowBadge,
  countPersonalizedRiskRows,
} from '../utils/personalizedPm25'
import { notifyProvincePm25IfDue } from '../utils/provinceNotification'
import {
  getAirQualityStations,
  getUserLocation,
  getStationsMeta,
} from '../services/airQuality'
import '../styles/home-v2.css'

// หน้าหลัก v2 — โครงหน้า/สี/typography ตามดีไซน์ Stitch
// การดึงค่ารายพื้นที่: ทุกค่าเป็นค่าจริงจาก API ณ พิกัดจริงของพื้นที่นั้น ๆ
// (สถานีตรวจวัดใกล้ที่สุดในจังหวัด ≤ 12 กม. หรือค่าจากแหล่งข้อมูลบรรยากาศ ณ พิกัดอำเภอ)
// ไม่มีการสุ่มตัวเลขหรือบวกเลขจำลอง — พื้นที่ใดดึงไม่ได้จะถูกตัดออกจากการจัดอันดับ

const THAI_PM25_STANDARD = 37.5 // มาตรฐานไทย 24 ชม. (พ.ศ. 2566) — ชุดเดียวกับ PRIMARY_PM25_THRESHOLD_SET_ID

const TIER_COLORS = {
  green: '#047857',
  yellow: '#b45309',
  orange: '#c2410c',
  red: '#b91c1c',
}

export default function Home() {
  const [data, setData] = useState({
    status: 'loading',
    error: '',
    province: '',
    profileProvince: '',
    stations: [],
    allAreas: [],
    averagePm25: 0,
    updatedAt: null,
    profile: null,
    assessment: null,
    healthProfile: null,
    meta: null,
    stationsAll: [],
  })
  const requestRef = useRef(0)
  const [refreshing, setRefreshing] = useState(false)

  async function load(authUser = null) {
    const currentRequest = ++requestRef.current
    setData((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const [{ data: { user } }, location] = await Promise.all([
        authUser ? Promise.resolve({ data: { user: authUser } }) : supabase.auth.getUser(),
        getUserLocation(),
      ])
      if (!user) throw new Error('ไม่พบผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่')
      const [profileRes, assessmentRes, healthProfileRes, stations] = await Promise.all([
        supabase.from('profiles').select('full_name, health_risk_group, has_completed_assessment, province').eq('id', user.id).maybeSingle(),
        supabase.from('risk_assessments').select('answers, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('health_profiles').select('chronic_condition, medication').eq('user_id', user.id).maybeSingle(),
        getAirQualityStations(location.latitude, location.longitude),
      ])
      if (profileRes.error) throw profileRes.error
      if (assessmentRes.error) throw assessmentRes.error
      if (healthProfileRes.error) throw healthProfileRes.error
      const profile = profileRes.data
      const province = profile?.province || ''
      const computed = await computeProvinceAreas(stations, province)
      const personalized = getPersonalizedPm25Result(computed.averagePm25, profile, assessmentRes.data || null, healthProfileRes.data || null)
      // แจ้งเตือนตามจังหวัดในโปรไฟล์ (fire-and-forget เหมือนของเดิม)
      notifyProvincePm25IfDue({ province, pm25: computed.averagePm25, tier: personalized.tier, isSensitive: personalized.audience === 'sensitive' }).catch(() => {})
      console.debug('[Personalized PM2.5]', { userId: user.id, profile, assessmentAnswers: assessmentRes.data?.answers || null, healthProfile: healthProfileRes.data, audience: personalized.audience })
      if (requestRef.current !== currentRequest) return
      setData({
        status: 'ready',
        error: '',
        province,
        profileProvince: province,
        stations: computed.ranked.slice(0, 5),
        allAreas: computed.allAreas,
        averagePm25: computed.averagePm25,
        updatedAt: computed.updatedAt,
        profile,
        assessment: assessmentRes.data || null,
        healthProfile: healthProfileRes.data || null,
        meta: getStationsMeta(),
        stationsAll: stations,
      })
    } catch (error) {
      if (requestRef.current !== currentRequest) return
      setData((current) => ({ ...current, status: 'error', error: error.message || 'ไม่สามารถโหลดข้อมูลคุณภาพอากาศได้' }))
    }
  }

  useEffect(() => {
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      requestRef.current += 1
      if (!session?.user) {
        setData({ status: 'error', error: 'กรุณาเข้าสู่ระบบ', province: '', profileProvince: '', stations: [], allAreas: [], averagePm25: 0, updatedAt: null, profile: null, assessment: null, healthProfile: null, meta: null, stationsAll: [] })
        return
      }
      load(session.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function switchProvince(nextProvince) {
    if (!nextProvince || nextProvince === data.province) return
    const currentRequest = ++requestRef.current
    setData((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const computed = await computeProvinceAreas(data.stationsAll, nextProvince)
      if (requestRef.current !== currentRequest) return
      setData((current) => ({
        ...current,
        status: 'ready',
        error: '',
        province: nextProvince,
        stations: computed.ranked.slice(0, 5),
        allAreas: computed.allAreas,
        averagePm25: computed.averagePm25,
        updatedAt: computed.updatedAt,
        meta: getStationsMeta(),
      }))
    } catch (error) {
      if (requestRef.current !== currentRequest) return
      setData((current) => ({ ...current, status: 'error', error: error.message || 'ไม่สามารถโหลดข้อมูลจังหวัดนี้ได้' }))
    }
  }

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const personalized = useMemo(
    () => getPersonalizedPm25Result(data.averagePm25, data.profile, data.assessment, data.healthProfile),
    [data.averagePm25, data.profile, data.assessment, data.healthProfile],
  )
  const clinicalGuidance = getClinicalGuidancePlaceholder(personalized.audience)
  const personalRowCounts = countPersonalizedRiskRows(data.stations.map((area) => Number(area.pm25)), personalized.audience)

  const heroAqi = pm25ToAqi(Number(data.averagePm25)) ?? 40
  const heroStatus = getAqiStatus(heroAqi)
  const pm25Value = Number(data.averagePm25)
  const overRatio = pm25Value > THAI_PM25_STANDARD ? (pm25Value / THAI_PM25_STANDARD).toFixed(2) : null
  const barWidth = Math.min(Math.max((pm25Value / (THAI_PM25_STANDARD * 2)) * 100, 2), 100)
  const officialTier = getPm25Tier(pm25Value, PRIMARY_PM25_THRESHOLD_SET_ID)
  const isStale = Boolean(data.meta?.stale || data.meta?.air4thai?.stale)
  const lastUpdated = data.updatedAt || data.meta?.updatedAt || 'ล่าสุด'
  const warningBody = personalized.generalWarnings?.length
    ? personalized.generalWarnings.join(' ')
    : `ค่าฝุ่น PM2.5 อยู่ระดับ${officialTier?.label_th || 'รอข้อมูล'} — ${personalized.reason || 'ติดตามสุขภาพและค่าฝุ่นต่อเนื่อง'}`
  const warningTone = ['orange', 'red'].includes(heroStatus.tone) ? 'hot' : 'calm'

  if (data.status === 'loading' && !data.stationsAll.length) {
    return (
      <div className="rc2-page">
        <div className="rc2-page-status" role="status" aria-live="polite">
          <strong>กำลังโหลดข้อมูลคุณภาพอากาศ</strong>
          ระบบกำลังดึงค่าฝุ่นรายพื้นที่ของทุกอำเภอในจังหวัดของคุณ
        </div>
      </div>
    )
  }

  return (
    <div className="rc2-page">
      {/* Header Area */}
      <section className="rc2-home-head">
        <div>
          <span className="rc2-eyebrow"><Icon name="location_city" size={16} /> ศูนย์ข้อมูลคุณภาพอากาศรายจังหวัด</span>
          <h1 className="rc2-home-title">
            ภาพรวมคุณภาพอากาศ
            <em>| จังหวัด{data.province || 'ไม่ระบุ'}</em>
          </h1>
          <p className="rc2-home-desc">
            รายงานและติดตามสถานการณ์ฝุ่นละออง PM2.5 พร้อมการจัดอันดับพื้นที่สูงสุดภายในจังหวัด
          </p>
        </div>
        <div className="rc2-head-controls">
          <label className="rc2-prov-picker">
            <Icon name="explore" size={20} />
            <span>
              <span className="rc2-prov-picker-label">เลือกจังหวัด</span>
              <select
                aria-label="เลือกจังหวัดที่ต้องการดูภาพรวมคุณภาพอากาศ"
                value={data.province}
                onChange={(event) => switchProvince(event.target.value)}
              >
                {(UNIQUE_THAI_PROVINCES.includes(data.province) || !data.province
                  ? UNIQUE_THAI_PROVINCES
                  : [data.province, ...UNIQUE_THAI_PROVINCES]
                ).map((province) => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
            </span>
          </label>
          <div className="rc2-sync-box">
            <div>
              <div className="rc2-sync-time">อัปเดต: {lastUpdated}</div>
              <div className={`rc2-sync-state${isStale ? ' is-stale' : ''}`}>
                <span className={`rc2-sync-dot${isStale ? ' is-stale' : ''}`} />
                สถานะข้อมูล: {isStale ? 'ล่าสุดล้าสมัย' : 'เชื่อมต่อปกติ'}
              </div>
            </div>
            <button type="button" className="rc2-icon-btn" aria-label="รีเฟรชข้อมูลล่าสุด" title="รีเฟรชข้อมูลตรวจวัด" onClick={refresh}>
              <Icon name="sync" size={18} className={refreshing ? 'rc2-spinner' : ''} />
            </button>
          </div>
        </div>
      </section>

      {data.status === 'error' && (
        <div className="rc2-banner rc2-banner--error" role="alert">
          <span className="rc2-banner-icon"><Icon name="error" size={20} /></span>
          <div className="rc2-banner-text">
            <strong>เกิดข้อผิดพลาดในการดึงข้อมูล:</strong> {data.error || 'ไม่สามารถดึงข้อมูลได้ในขณะนี้'}
          </div>
          <button type="button" className="rc2-banner-retry" onClick={refresh}>ลองใหม่</button>
        </div>
      )}

      {/* CARD 1: ภาพรวมฝุ่นของจังหวัดที่เลือก */}
      <section className="rc2-card">
        {data.status === 'loading' && data.stationsAll.length > 0 && (
          <div className="rc2-loading-overlay" role="status" aria-live="polite">
            <Icon name="sync" size={36} className="rc2-spinner" />
            <p className="rc2-loading-text">กำลังดึงข้อมูลคุณภาพอากาศล่าสุด...</p>
          </div>
        )}
        <div className="rc2-card-stack">
          <div className="rc2-card-top">
            <div className="rc2-card-title-row">
              <span className="rc2-card-title-icon"><Icon name="air" size={24} /></span>
              <div>
                <h2 className="rc2-card-title">
                  คุณภาพอากาศจังหวัด{data.province || 'ไม่ระบุ'}
                  {data.province && data.province === data.profileProvince && (
                    <span className="rc2-prov-badge">จังหวัดของผู้ใช้</span>
                  )}
                </h2>
                <p className="rc2-card-subtitle">
                  ค่าฝุ่นรายพื้นที่ {data.allAreas.length} พื้นที่ทั่วจังหวัด{data.updatedAt ? ` · อัปเดต ${data.updatedAt}` : ''}
                </p>
              </div>
            </div>
            <span className={`rc2-telemetry-pill${isStale ? ' is-stale' : ''}`}>
              <span className={`rc2-telemetry-dot${isStale ? ' is-stale' : ''}`} />
              {isStale ? 'ข้อมูลล่าสุดล้าสมัย' : 'ข้อมูลล่าสุด'}
            </span>
          </div>

          <div className="rc2-metrics">
            <div className="rc2-metric">
              <div className="rc2-metric-head">
                <span className="rc2-metric-label">ความหนาแน่น PM2.5 เฉลี่ยจังหวัด</span>
                <span className="rc2-metric-note">เกณฑ์มาตรฐาน ≤ 37.5 µg/m³ (คพ. 2566)</span>
              </div>
              <div className="rc2-hero-row">
                <span className="rc2-hero-num">{pm25Value.toFixed(1)}</span>
                <span className="rc2-hero-unit">µg/m³</span>
              </div>
              <div>
                <div className="rc2-pm25-bar">
                  <div className="rc2-pm25-bar-fill" style={{ width: `${barWidth}%`, background: heroStatus.background }} />
                </div>
                <div className="rc2-pm25-bar-legend">
                  <span>0 (ดีมาก)</span>
                  <strong style={{ color: overRatio ? '#ea580c' : '#047857' }}>
                    {overRatio ? `เกินเกณฑ์ ${overRatio} เท่า` : 'อยู่ในเกณฑ์มาตรฐาน'}
                  </strong>
                  <span>75+ (อันตราย)</span>
                </div>
              </div>
            </div>
            <div className="rc2-metric">
              <div className="rc2-metric-head">
                <span className="rc2-metric-label">ดัชนีคุณภาพอากาศ (US AQI)</span>
                <span className="rc2-metric-note">มาตรฐานสากล</span>
              </div>
              <div className="rc2-hero-row">
                <span className="rc2-hero-num">{heroAqi}</span>
                <span className="rc2-hero-unit-sm">US AQI</span>
              </div>
              <div className="rc2-aqi-subrow">
                <span className="rc2-status-tag" style={{ background: heroStatus.background, color: heroStatus.textColor }}>
                  <span className="rc2-status-dot" />
                  {heroStatus.label}
                </span>
                <span className="rc2-status-subtext">
                  {personalized.audience === 'sensitive'
                    ? `กลุ่มเสี่ยง — ${personalized.tier?.label_th || 'รอข้อมูล'}`
                    : personalized.audience === 'unknown'
                      ? 'ทำแบบประเมินสุขภาพเพื่อรับคำแนะนำเฉพาะบุคคล'
                      : `กลุ่มทั่วไป — ${personalized.tier?.label_th || 'รอข้อมูล'}`}
                </span>
              </div>
            </div>
          </div>

          <div
            className="rc2-warning-strip"
            style={warningTone === 'hot'
              ? { background: '#fff7ed', border: '1px solid rgba(251, 146, 60, 0.9)' }
              : { background: '#ecfdf5', border: '1px solid #d1fae5' }}
          >
            <span
              className="rc2-warning-strip-icon"
              style={{ background: warningTone === 'hot' ? '#f97316' : '#047857' }}
            >
              <Icon name="health_and_safety" size={20} />
            </span>
            <div>
              <div className="rc2-warning-strip-title" style={{ color: warningTone === 'hot' ? '#7c2d12' : '#065f46' }}>
                ⚠️ คำเตือนคุณภาพอากาศ ({personalized.audience === 'sensitive' ? 'สำหรับกลุ่มเสี่ยง' : personalized.audience === 'unknown' ? 'ยังไม่ประเมิน' : 'สำหรับประชาชนทั่วไป'}):
              </div>
              <p
                className="rc2-warning-strip-body"
                style={{ color: warningTone === 'hot' ? '#9a3412' : '#065f46' }}
              >
                {warningBody}
              </p>
            </div>
          </div>

          <div className="rc2-card-footer">
            <div className="rc2-card-footer-note">
              ข้อมูลคุณภาพอากาศตรวจวัดและประมวลผลตามมาตรฐานระดับประเทศ
            </div>
            <div className="rc2-card-footer-links">
              {personalized.audience === 'unknown' && (
                <Link className="rc2-link-solid" to="/assessment">ทำแบบประเมินความเสี่ยง</Link>
              )}
              <Link className="rc2-link-soft" to="/air-quality-trend">
                ดูแนวโน้มฝุ่นรายวัน <Icon name="trending_up" size={16} />
              </Link>
              <Link className="rc2-link-solid" to="/hourly-forecast">
                ดูพยากรณ์รายชั่วโมง <Icon name="schedule" size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column section */}
      <section className="rc2-detail-grid">
        {/* การ์ดที่ 2: สรุปสถานการณ์ */}
        <div className="rc2-card rc2-col-5" style={{ padding: 24 }}>
          <div className="rc2-panel-head">
            <div className="rc2-panel-title-row">
              <span className="rc2-panel-icon"><Icon name="analytics" size={20} /></span>
              <div>
                <h3 className="rc2-panel-title">สรุปสถานการณ์ฝุ่นจังหวัด{data.province || 'ไม่ระบุ'}</h3>
                <p className="rc2-panel-subtitle">ค่าเฉลี่ยจากพื้นที่ทั้งหมด {data.allAreas.length} พื้นที่ในจังหวัด</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="rc2-avg-grid">
              <div className="rc2-avg-tile">
                <span className="rc2-avg-label">ค่าเฉลี่ย PM2.5 ทั้งจังหวัด</span>
                <span className="rc2-avg-value">
                  <span className="rc2-avg-num">{pm25Value.toFixed(1)}</span>
                  <span className="rc2-avg-unit">µg/m³</span>
                </span>
                <span className="rc2-avg-status" style={{ color: TIER_COLORS[officialTier?.color_token] || '#64748b' }}>
                  {officialTier?.label_th || 'รอข้อมูล'}
                </span>
              </div>
              <div className="rc2-avg-tile">
                <span className="rc2-avg-label">ค่าเฉลี่ย AQI ทั้งจังหวัด</span>
                <span className="rc2-avg-value">
                  <span className="rc2-avg-num">{heroAqi}</span>
                  <span className="rc2-avg-unit">AQI</span>
                </span>
                <span className="rc2-avg-status" style={{ color: TIER_COLORS[officialTier?.color_token] || '#64748b' }}>
                  {heroStatus.label}
                </span>
              </div>
            </div>

            <div>
              <span className="rc2-section-label">คำเตือนเฉพาะบุคคล</span>
              <div className="rc2-personal-box" style={{ marginTop: 8 }}>
                <strong>
                  {personalized.audience === 'sensitive' ? 'กลุ่มเสี่ยง' : personalized.audience === 'unknown' ? 'ยังประเมินไม่ได้' : 'กลุ่มทั่วไป'}
                  {personalized.tier ? ` — ${personalized.tier.label_th}` : ''}
                </strong>
                {personalized.reason && <p>เหตุผล: {personalized.reason}</p>}
                {personalized.audience === 'sensitive' && personalRowCounts.flagged > 0 && (
                  <p>สำหรับกลุ่มเสี่ยง: {personalRowCounts.flagged} จาก {personalRowCounts.total} พื้นที่ เริ่มมีผลกระทบต่อคุณ</p>
                )}
                {personalized.generalWarnings?.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            </div>

            <div>
              <span className="rc2-section-label">คำแนะนำการดูแลสุขภาพ</span>
              <ul className="rc2-guidance-list" style={{ marginTop: 8 }}>
                {clinicalGuidance.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <small className="rc2-guidance-label">{clinicalGuidance.label}</small>
            </div>

            <details className="rc2-reference-details">
              <summary>ⓘ ดูรายละเอียดแหล่งอ้างอิง</summary>
              <p>อิงเกณฑ์ไทย ประกาศ คพ. 2566 เมื่อแหล่งข้อมูลยืนยันว่าเป็นค่าเฉลี่ย 24 ชั่วโมง</p>
              <p>สำหรับกลุ่มเสี่ยง ระดับคำเตือนอิงเกณฑ์ US EPA PM2.5 breakpoints (2024) สำหรับกลุ่มไวต่อผลกระทบ</p>
              <p>Known limitation: ระบบยังไม่สามารถยืนยันได้ว่าค่า PM2.5 จากทุกแหล่งเป็นค่าเฉลี่ย 24 ชั่วโมง</p>
            </details>
          </div>
        </div>

        {/* การ์ดที่ 3: 5 พื้นที่ค่าฝุ่นสูงสุด */}
        <div className="rc2-card rc2-col-7" style={{ padding: 24 }}>
          <div className="rc2-panel-head">
            <div>
              <div className="rc2-panel-title-row">
                <span className="rc2-panel-icon"><Icon name="format_list_numbered" size={20} /></span>
                <h3 className="rc2-panel-title">5 พื้นที่ที่มีค่าฝุ่นสูงสุดในจังหวัดของคุณ</h3>
              </div>
              <p className="rc2-panel-subtitle">จัดอันดับตามค่าความเข้มข้น PM2.5 ภายในจังหวัด{data.province || 'ไม่ระบุ'} (สูงสุดไปต่ำสุด)</p>
            </div>
            <span className="rc2-panel-tag">เฉพาะในจังหวัดนี้</span>
          </div>
          <div className="rc2-rank-list">
            {data.stations.length === 0 && (
              <div className="rc2-banner rc2-banner--empty">
                <Icon name="cloud_off" size={36} />
                <h3>ไม่มีข้อมูลคุณภาพอากาศสำหรับพื้นที่นี้</h3>
                <p>ยังไม่มีข้อมูลที่ใช้ได้สำหรับจังหวัดนี้ โปรดเลือกจังหวัดอื่นหรือลองใหม่ภายหลัง</p>
              </div>
            )}
            {data.stations.map((area, index) => {
              const aqi = pm25ToAqi(Number(area.pm25))
              const status = getAqiStatus(aqi)
              const personalBadge = getPersonalizedRowBadge(Number(area.pm25), personalized.audience)
              const rankTone = ['green', 'lime', 'yellow', 'orange', 'red'].includes(status.tone) ? status.tone : 'pending'
              return (
                <div className={`rc2-rank-row rc2-rank-row--${status.tone}`} key={`${area.name}-${index}`}>
                  <div className="rc2-rank-main">
                    <span className={`rc2-rank-num rc2-rank-num--${rankTone}`}>{String(index + 1).padStart(2, '0')}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="rc2-rank-name-row">
                        <span className="rc2-rank-name">{area.name}</span>
                        {index === 0 && <span className="rc2-rank-tag rc2-rank-tag--red">อันดับสูงสุด</span>}
                      </div>
                      <div className="rc2-rank-meta">
                        <span>อัปเดต {area.updatedAt || 'ล่าสุด'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rc2-rank-values">
                    <div>
                      <div className="rc2-rank-aqi" style={{ color: status.background === '#E2E8F0' ? '#475569' : status.background }}>
                        AQI {aqi ?? '—'}
                      </div>
                      <div className="rc2-rank-pm">PM2.5 {Number(area.pm25).toFixed(1)} µg/m³</div>
                    </div>
                    <span className="rc2-rank-status" style={{ background: status.background, color: status.textColor }}>
                      {status.label}
                    </span>
                    {personalBadge && <span className="rc2-personal-badge">⚠ สำหรับคุณ: {personalBadge.label}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
