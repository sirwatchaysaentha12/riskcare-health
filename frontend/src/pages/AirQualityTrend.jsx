import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getEmojiByStatusLabel } from '../utils/aqiStatus'
import { getPersonalizedAudience } from '../utils/personalizedPm25'
import { fetchAirQualityDashboard } from '../services/airQualityDashboard'
import { useProvinceAirLocation } from '../hooks/useProvinceAirLocation'
import { UNIQUE_THAI_PROVINCES } from '../data/thaiProvinces'
import { getProvinceCoords } from '../data/provinceCoords'
import camsStats from '../data/camsAccuracyStats.json'

const API_URL = '/api/air-quality/dashboard'
const API_BACKEND_TARGET = 'http://127.0.0.1:3000/api/air-quality/dashboard'
const historyTabs = [
  { id: 'currentWeek', label: 'สัปดาห์นี้', days: 7 },
  { id: 'previousWeek', label: 'สัปดาห์ที่แล้ว', days: 14 },
  { id: 'twoWeeksAgo', label: '2 สัปดาห์ที่แล้ว', days: 21 },
  { id: 'threeWeeksAgo', label: '3 สัปดาห์ที่แล้ว', days: 28 },
  { id: 'fourWeeksAgo', label: '4 สัปดาห์ที่แล้ว', days: 35 },
]
// กลุ่ม 2 = "โฟกัสวัน" (ไม่ตัดข้อมูล): วันนี้ไฮไลต์ในกราฟย้อนหลัง, วันพยากรณ์แสดงคู่ 3 วันจริงท้ายสุด
const focusTabs = [
  { id: 'today', label: 'วันนี้', forecastDays: 0 },
  { id: 'tomorrow', label: 'พรุ่งนี้', forecastDays: 1 },
  { id: 'day2', label: '2 วันถัดไป', forecastDays: 2 },
  { id: 'day3', label: '3 วันถัดไป', forecastDays: 3 },
]

// วันนี้ตามเขตเวลา Asia/Bangkok (ให้ตรงกับการตัดวันของ OpenAQ daily rollups)
const bangkokToday = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
const addBangkokDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00+07:00`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`))
}

function EmptyState({ loading = false, message = '' }) {
  return <div className="aq-empty-state"><strong>{loading ? 'กำลังโหลดข้อมูล...' : message || 'ยังไม่มีข้อมูลคุณภาพอากาศ'}</strong>{!loading && !message && <span>กรุณาเชื่อมต่อ API หรือเพิ่มข้อมูลจริงในระบบ</span>}</div>
}

function LeafMark() {
  return <span className="aq-leaf" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 3.5C12 3.5 5 6.8 5 13.1c0 3.6 2.6 6 6 6 6.3 0 9.5-7 9.5-15.6Z" /><path d="M3.5 20.5c3.3-5.1 7-8.3 12-11" /><path d="M5.2 13.2c2.2.2 4.1.9 5.7 2.2" /></svg></span>
}

// ป้ายประเภทข้อมูล 4 สถานะ (dataType จาก API) — แยกด้วยข้อความและรูปแบบขอบ ไม่ใช้สีอย่างเดียว
const badgeByType = {
  observed: { cls: 'aq-badge-real', label: 'ข้อมูลจริง' },
  forecast: { cls: 'aq-badge-forecast', label: 'คาดการณ์' },
  estimated: { cls: 'aq-badge-estimated', label: 'ประมาณการ' },
  missing: { cls: 'aq-badge-missing', label: 'ไม่มีข้อมูล' },
}
function Badge({ row }) {
  const type = row.dataType ?? (row.isForecast ? 'forecast' : 'observed')
  const badge = badgeByType[type] ?? badgeByType.observed
  return <b className={`aq-badge ${badge.cls}`}>{badge.label}</b>
}

function Chart({ rows, focusedDate, emptyMessage = 'ยังไม่มีข้อมูลในช่วงเวลานี้' }) {
  if (!rows.length) return <EmptyState message={emptyMessage} />
  const width = 1100; const height = 280; const left = 44; const bottom = 48
  const values = rows.map((row) => Number(row.value))
  const min = Math.min(...values); const max = Math.max(...values, min + 1)
  const points = rows.map((row, index) => { const x = left + (index / Math.max(rows.length - 1, 1)) * (width - left * 2); const y = 38 + ((max - values[index]) / Math.max(max - min, 1)) * 194; return { ...row, x, y, value: values[index] } })
  // เส้นเชื่อมแบบ monotone cubic (Fritsch-Carlson): โค้งเลื่อนไหลแต่ไม่ overshoot เกินค่าจริง
  // marker แต่ละจุดยังตรงค่าข้อมูลจริงเหมือนเดิม — เส้นเป็นแค่ตัวเชื่อมสายตา
  const smoothPath = (pts) => {
    if (pts.length < 3) return pts.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
    const dx = []; const slope = []
    for (let i = 0; i < pts.length - 1; i++) { dx.push(pts[i + 1].x - pts[i].x); slope.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x)) }
    const tangents = new Array(pts.length)
    tangents[0] = slope[0]; tangents[pts.length - 1] = slope[pts.length - 2]
    for (let i = 1; i < pts.length - 1; i++) tangents[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
    let path = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const cx1 = pts[i].x + dx[i] / 3
      const cy1 = pts[i].y + (dx[i] / 3) * tangents[i]
      const cx2 = pts[i + 1].x - dx[i] / 3
      const cy2 = pts[i + 1].y - (dx[i] / 3) * tangents[i + 1]
      path += ` C ${cx1.toFixed(2)} ${cy1.toFixed(2)}, ${cx2.toFixed(2)} ${cy2.toFixed(2)}, ${pts[i + 1].x} ${pts[i + 1].y}`
    }
    return path
  }
  const line = smoothPath(points)
  const curve = line.replace(/^M [^C]+/, '')
  const area = `M ${points[0].x} ${height - bottom} L ${points[0].x} ${points[0].y} ${curve} L ${points.at(-1).x} ${height - bottom} Z`
  const focused = points.find((point) => point.date === focusedDate)
  // Responsive label thinning: แสดง label วันที่/ค่าไม่เกิน ~10 จุดตามจำนวนข้อมูลจริง
  // (สัปดาห์นี้ 7 จุด → โชว์ทุกวัน, 4 สัปดาห์ 35 จุด → เว้นทุก ~4 วัน) — marker ยังอยู่ครบทุกวัน
  const labelStep = Math.max(1, Math.ceil(rows.length / 10))
  const showLabel = (index) => index % labelStep === 0 || index === points.length - 1 || points[index].date === focusedDate
  return <div className="aq-chart-scroll"><svg className="aq-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="กราฟแนวโน้ม PM2.5"><defs><linearGradient id="aq-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#46B99F" stopOpacity=".15" /><stop offset="1" stopColor="#46B99F" stopOpacity=".02" /></linearGradient></defs><g className="aq-chart-grid"><line x1="40" y1="80" x2="1060" y2="80" /><line x1="40" y1="145" x2="1060" y2="145" /><line x1="40" y1="210" x2="1060" y2="210" /></g><path d={area} className="aq-chart-area" /><path d={line} className="aq-chart-line" />{focused && <line x1={focused.x} y1={30} x2={focused.x} y2={height - bottom} className={`aq-chart-focus-line ${focused.isForecast ? 'is-forecast' : 'is-real'}`} />}{points.map((point, index) => <g key={`${point.date}-${point.value}`}>{showLabel(index) && <text x={point.x} y={point.y - 14} className="aq-chart-value">{point.value.toFixed(1)}</text>}<circle cx={point.x} cy={point.y} r={point.date === focusedDate ? 7 : 5} className={`aq-chart-point${point.date === focusedDate ? ' is-focused' : ''}`} />{showLabel(index) && <text x={point.x} y="265" className="aq-chart-label">{formatDate(point.date)}</text>}</g>)}</svg></div>
}

export default function AirQualityTrend() {
  const navigate = useNavigate()
  const [selectedHistory, setSelectedHistoryState] = useState('currentWeek')
  const [metric, setMetric] = useState('PM2.5')
  const [focus, setFocus] = useState(null) // null | 'today' | 'tomorrow' | 'day2' | 'day3'
  const [rows, setRows] = useState([])
  const [forecastRows, setForecastRows] = useState([])
  // 'idle' = กำลังโหลดครั้งแรก/หลังกดลองใหม่, 'granted' = พร้อมข้อมูล, 'empty' = สถานีไม่มีข้อมูลช่วงนี้,
  // 'no_station_nearby' = ไม่พบสถานีในรัศมี, 'error' = โหลดไม่สำเร็จ
  const [apiState, setApiState] = useState('idle')
  const [dataFreshness, setDataFreshness] = useState('none')
  const [cachedAt, setCachedAt] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [errorDetails, setErrorDetails] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [refetching, setRefetching] = useState(false) // indicator ตอนเปลี่ยนหน้าต่าง/metric (ข้อมูลเก่ายังโชว์ระหว่างรอ)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [isSensitive, setIsSensitive] = useState(false) // กลุ่มสุขภาพของผู้ใช้ → คำแนะนำเฉพาะบุคคล
  const [modelVersion, setModelVersion] = useState(null) // เวอร์ชันโมเดลที่ให้ค่าพยากรณ์ (ย้อนตรวจได้)
  const [forecastNote, setForecastNote] = useState('') // คำอธิบายที่มาของค่าพยากรณ์จาก backend
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState(null)
  const [forecastStale, setForecastStale] = useState(false)
  const [forecastStationCount, setForecastStationCount] = useState(0)
  const [dataNotice, setDataNotice] = useState('') // แจ้งเมื่อแสดงค่าประมาณจากแหล่งข้อมูลแบบกริด
  const [todayEstimate, setTodayEstimate] = useState(null) // ประมาณการของวันนี้ (เมื่อสถานียังไม่ส่งค่าวัดจริง)
  // ตำแหน่งอ้างอิง: จังหวัดจาก profiles.province เป็นหลัก, GPS เป็นตัวเลือกเสริม (กดปุ่มเอง)
  const { provinceState, province, coords, mode, gpsStatus, requestGps, backToProfileProvince } = useProvinceAirLocation()
  // จุดที่ 3: จังหวัดสำหรับ "ดูข้อมูลย้อนหลัง" — อิสระจากแหล่งค่าเริ่มต้น (โปรไฟล์/GPS)
  // browseProvince = null → ยังไม่แตะ → ตามแหล่งค่าเริ่มต้น (โปรไฟล์ หรือ GPS ถ้ากดปุ่ม)
  // ค่าเริ่มต้น = จังหวัดในโปรไฟล์ (สะดวกผู้ใช้ส่วนใหญ่) แต่เลือกเปลี่ยนเองได้โดยไม่กระทบโปรไฟล์
  const GPS_PROVINCE_KEY = '__gps__'
  const [browseProvince, setBrowseProvince] = useState(null)
  const effectiveProvince = browseProvince ?? (mode === 'gps' ? GPS_PROVINCE_KEY : province)
  const gpsCoords = mode === 'gps' ? coords : null
  const fetchCoords = useMemo(() => effectiveProvince === GPS_PROVINCE_KEY
    ? gpsCoords
    : (effectiveProvince ? getProvinceCoords(effectiveProvince) : null), [effectiveProvince, gpsCoords])
  const handleUseGps = () => { setRefetching(true); requestGps(); setBrowseProvince(GPS_PROVINCE_KEY) }
  const handleBackToProfileProvince = () => { setRefetching(true); backToProfileProvince(); setBrowseProvince(null) }
  const history = historyTabs.find((tab) => tab.id === selectedHistory) || historyTabs[0]
  const setSelectedHistory = (value) => { setSelectedHistoryState(value); setSelectedModeOff(); setRefetching(true) }
  const setSelectedModeOff = () => { setFocus((current) => (current && current !== 'today' ? null : current)) }
  const today = bangkokToday()
  const todayRow = rows.find((row) => row.date === today)

  // ดึงกลุ่มสุขภาพของผู้ใช้ (แบบประเมิน + โรคประจำตัว) → ส่งเป็น risk param ให้ API คำนวณคำแนะนำเฉพาะบุคคล
  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('profiles').select('health_risk_group, has_completed_assessment').maybeSingle(),
      supabase.from('risk_assessments').select('answers, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('health_profiles').select('chronic_condition, medication').maybeSingle(),
    ])
      .then(([profile, assessment, healthProfile]) => {
        if (!active) return
        const audience = getPersonalizedAudience(profile.data, assessment.data, healthProfile.data)
        setIsSensitive(audience.audience === 'sensitive')
      })
      .catch(() => { /* ดึงข้อมูลสุขภาพไม่ได้ → ใช้คำแนะนำกลุ่มทั่วไป */ })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!fetchCoords) return undefined
    let active = true
    const controller = new AbortController()
    setForecastLoading(false)
    const forecastLoadingTimer = window.setTimeout(() => {
      if (active) setForecastLoading(true)
    }, 350)
    const provinceForecastParams = new URLSearchParams({ forecastModel: 'v27' })
    if (effectiveProvince !== GPS_PROVINCE_KEY) provinceForecastParams.set('province', effectiveProvince)
    const url = `${API_URL}?period=${history.id}&metric=${encodeURIComponent(metric)}&lat=${fetchCoords.latitude}&lon=${fetchCoords.longitude}&risk=${isSensitive ? 'sensitive' : 'general'}&${provinceForecastParams}`
    fetchAirQualityDashboard(url, { signal: controller.signal })
      .then(({ payload, source, cachedAt: responseCachedAt }) => {
        if (!active) return
        setApiState(payload.state)
        setDataFreshness(source)
        setCachedAt(source === 'stale' ? responseCachedAt : null)
        setErrorDetails(null)
        const historical = Array.isArray(payload.historical) ? payload.historical.filter((row) => row && Number.isFinite(Number(row.value))) : []
        const forecast = Array.isArray(payload.forecast) ? payload.forecast : []
        setRows(historical)
        setForecastRows(forecast)
        setModelVersion(typeof payload.modelVersion === 'string' ? payload.modelVersion : null)
        setForecastNote(typeof payload.forecastNote === 'string' ? payload.forecastNote : '')
        setForecastUpdatedAt(typeof payload.forecastUpdatedAt === 'string' ? payload.forecastUpdatedAt : null)
        setForecastStale(payload.forecastStale === true)
        setForecastStationCount(Number.isFinite(Number(payload.forecastStationCount)) ? Number(payload.forecastStationCount) : 0)
        setDataNotice(typeof payload.dataNotice === 'string' ? payload.dataNotice : '')
        setTodayEstimate(payload.todayEstimate && Number.isFinite(Number(payload.todayEstimate.value)) ? payload.todayEstimate : null)
        // โฟกัสค่าเริ่มต้น: "วันนี้" ถ้ามีข้อมูลวันนี้ในหน้าต่างที่เลือก, เปลี่ยนหน้าต่าง → ประเมินใหม่
        setFocus((current) => {
          if (current && current !== 'today') return null
          return historical.some((row) => row.date === today) ? 'today' : null
        })
        setErrorMessage(source === 'stale' ? 'เชื่อมต่อข้อมูลสดไม่ได้ กำลังแสดงข้อมูลล่าสุดที่เคยโหลดสำเร็จ' : '')
      })
      .catch((error) => {
        if (!active || error?.name === 'AbortError') return
        setApiState('error')
        setDataFreshness('none')
        setCachedAt(null)
        setRows([]); setForecastRows([]); setFocus(null); setTodayEstimate(null); setModelVersion(null); setForecastNote(''); setForecastUpdatedAt(null); setForecastStale(false); setForecastStationCount(0); setDataNotice('')
        const upstreamStatus = Number(error?.upstreamStatus) || null
        const failureCategory = upstreamStatus
          ? 'upstream'
          : error?.name === 'TypeError'
            ? 'network-or-proxy'
            : Number(error?.status) >= 500
              ? 'backend'
              : 'request'
        console.warn('[AirQualityTrend] dashboard request failed', {
          category: failureCategory,
          code: error?.code || 'DASHBOARD_REQUEST_FAILED',
          httpStatus: Number(error?.status) || null,
          upstreamStatus,
        })
        const friendlyMessage = error?.status === 502
          ? 'Backend ไม่ตอบสนอง กรุณาตรวจสอบว่าเปิด server หรือยัง'
          : upstreamStatus === 401
          ? 'แหล่งข้อมูลปฏิเสธการยืนยันตัวตน'
          : upstreamStatus === 403
            ? 'บัญชีไม่มีสิทธิ์เข้าถึงข้อมูลนี้'
            : upstreamStatus === 404
              ? 'ไม่พบข้อมูลที่ร้องขอ'
              : upstreamStatus === 429
                ? 'แหล่งข้อมูลจำกัดจำนวนคำขอชั่วคราว'
                : upstreamStatus >= 500
                  ? 'บริการข้อมูลขัดข้องชั่วคราว'
                  : error?.name === 'TypeError'
                    ? 'เชื่อมต่อ Backend ไม่สำเร็จ อาจเกิดจาก Server ยังไม่ทำงานหรือการตั้งค่า CORS และไม่มีข้อมูลสำรอง กรุณาลองใหม่อีกครั้ง'
                    : 'ไม่สามารถเชื่อมต่อข้อมูลคุณภาพอากาศได้ และไม่มีข้อมูลสำรองที่เคยโหลดไว้ กรุณาลองใหม่อีกครั้ง'
        setErrorDetails({
          code: error?.code || (error?.name === 'TypeError' ? 'NETWORK_OR_CORS_ERROR' : 'DASHBOARD_REQUEST_FAILED'),
          upstreamStatus,
          requestUrl: new URL(API_URL, window.location.origin).href,
          backendUrl: API_BACKEND_TARGET,
        })
        setErrorMessage(friendlyMessage)
      })
      .finally(() => {
        window.clearTimeout(forecastLoadingTimer)
        if (active) {
          setForecastLoading(false)
          setRefetching(false)
        }
      })
    return () => {
      active = false
      window.clearTimeout(forecastLoadingTimer)
      controller.abort()
    }
  }, [history.id, metric, fetchCoords, effectiveProvince, attempt, today, isSensitive])

  const loading = apiState === 'idle' || provinceState === 'loading'
  // ปุ่มโฟกัสวันใช้ได้เฉพาะช่วง "สัปดาห์นี้" — หน้าต่างเก่า (สัปดาห์ที่แล้วขึ้นไป) ไม่มีวันนี้/พรุ่งนี้
  // อยู่ในช่วงข้อมูล ถ้าบังคับแสดงกราฟจะเหลื่อมวันหลอกตา (จุดเรียงตาม index ไม่ใช่ตามวันจริง)
  const focusAvailable = selectedHistory === 'currentWeek'
  const focusTab = focusTabs.find((tab) => tab.id === focus) || null
  const forecastCount = focusAvailable ? (focusTab?.forecastDays ?? 0) : 0
  const expectedForecastDates = focusTab && focusTab.forecastDays > 0
    ? Array.from({ length: focusTab.forecastDays }, (_, index) => addBangkokDays(today, index + 1))
    : []
  const focusedForecastRows = expectedForecastDates
    .map((date) => forecastRows.find((row) => row.date === date))
    .filter(Boolean)
  // โฟกัสวันพยากรณ์ → กราฟแสดง 3 วันจริงท้ายสุดนำหน้า ให้เห็นการไหลจากของจริงไปคาดการณ์
  const visibleRows = forecastCount > 0 ? [...rows.slice(-3), ...focusedForecastRows] : rows
  const focusedDate = focus === 'today'
    ? todayRow?.date
    : focusTab ? focusedForecastRows.at(-1)?.date : null
  const todayAvailable = Boolean(todayRow)
  const focusDataMissing = Boolean(focusTab && (
    focusTab.id === 'today'
      ? !todayRow && !todayEstimate
      : focusedForecastRows.length < focusTab.forecastDays
  ))
  const forecastUnavailableMessage = forecastRows.length > 0
    ? 'ยังไม่มีผลพยากรณ์สำหรับวันที่เลือก รุ่นนี้ต้องใช้ค่าฝุ่นของวันก่อนหน้า และยังพยากรณ์ได้เฉพาะสถานีในชุดที่รองรับ'
    : forecastNote || 'ยังไม่มีข้อมูลพยากรณ์สำหรับจังหวัดนี้จากสถานีที่โมเดลรองรับ'
  const metricDescription = metric === 'AQI'
    ? 'AQI · ดัชนีคุณภาพอากาศรายวัน'
    : 'PM2.5 · ค่าฝุ่นละอองขนาดเล็กเฉลี่ยรายวัน'
  const modelBacktestWarning = modelVersion === '2.7-local-2026-10-01'
    ? ' · ผลทดสอบย้อนหลัง 1–7 ต.ค. ยังด้อยกว่า baseline'
    : ''

  const effectiveCoords = effectiveProvince === GPS_PROVINCE_KEY ? gpsCoords : (effectiveProvince ? getProvinceCoords(effectiveProvince) : null)
  if (provinceState === 'no-province' && !effectiveCoords) {
    return (
      <main className="aq-page">
        <div className="aq-shell">
          <button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button>
          <section className="aq-card">
            <div className="aq-empty-state">
              <strong>{province ? `ไม่พบพิกัดอ้างอิงของจังหวัด${province} ในระบบ` : 'คุณยังไม่ได้ตั้งค่าจังหวัดในโปรไฟล์'}</strong>
              <span>ค่าเริ่มต้นของหน้านี้อิงจังหวัดในโปรไฟล์ — ไปตั้งค่าจังหวัดก่อน ใช้ตำแหน่งปัจจุบันของอุปกรณ์แทน (ตัวเลือกเสริม) หรือเลือกจังหวัดเพื่อดูข้อมูลย้อนหลังด้านล่าง</span>
              <Link className="aq-retry" to="/profile">ไปตั้งค่าจังหวัดที่หน้าโปรไฟล์</Link>
              {gpsStatus === 'asking' ? (
                <span>กำลังขอตำแหน่งปัจจุบัน...</span>
              ) : gpsStatus === 'denied' ? (
                <><span>ยังไม่ได้อนุญาตการเข้าถึงตำแหน่ง — กดใหม่อีกครั้งเพื่อลองถามสิทธิ์</span><button type="button" className="aq-retry" onClick={handleUseGps}>ใช้ตำแหน่งปัจจุบันแทน</button></>
              ) : gpsStatus === 'unavailable' ? (
                <span>อุปกรณ์นี้ระบุตำแหน่งไม่ได้ — กรุณาตั้งค่าจังหวัดในโปรไฟล์</span>
              ) : (
                <button type="button" className="aq-retry" onClick={handleUseGps}>ใช้ตำแหน่งปัจจุบันแทน</button>
              )}
              <span style={{ marginTop: 8 }}>หรือเลือกจังหวัดเพื่อดูข้อมูลย้อนหลัง (ไม่กระทบค่าเริ่มต้นของโปรไฟล์):</span>
              <select
                className="aq-province-select"
                aria-label="เลือกจังหวัดสำหรับดูข้อมูลย้อนหลัง"
                value={effectiveProvince}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === GPS_PROVINCE_KEY) { handleUseGps() } else { setBrowseProvince(value) }
                }}
              >
                <option value="">— เลือกจังหวัด —</option>
                {UNIQUE_THAI_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </section>
        </div>
      </main>
    )
  }

  if (effectiveProvince === GPS_PROVINCE_KEY && !gpsCoords) {
    return (
      <main className="aq-page">
        <div className="aq-shell">
          <button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button>
          <section className="aq-card">
            <div className="aq-empty-state">
              <strong>{gpsStatus === 'asking' ? 'กำลังขอตำแหน่งปัจจุบัน...' : 'ยังไม่ได้อนุญาตการเข้าถึงตำแหน่ง'}</strong>
              <span>{gpsStatus === 'denied' ? 'เบราว์เซอร์ปฏิเสธสิทธิ์ตำแหน่ง — กดใหม่อีกครั้งเพื่อลองถามสิทธิ์ หรือกลับไปใช้จังหวัดจาก dropdown' : 'กดปุ่มด้านล่างเพื่อขอสิทธิ์ตำแหน่งอีกครั้ง หรือเลือกจังหวัดจาก dropdown แทน'}</span>
              {gpsStatus !== 'asking' && <button type="button" className="aq-retry" onClick={requestGps}>ใช้ตำแหน่งปัจจุบันแทน</button>}
              <button type="button" className="aq-retry" onClick={handleBackToProfileProvince}>กลับไปใช้จังหวัดตามโปรไฟล์</button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="aq-page">
      <div className="aq-shell">
        <button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button>
        <section className="aq-card">
          <header className="aq-header">
            <div className="aq-heading">
              <LeafMark />
              <div>
                <h1><span>แนวโน้มคุณภาพ</span><span>อากาศ</span></h1>
                <p>ติดตามค่าคุณภาพอากาศย้อนหลังและคาดการณ์ — กดปุ่มวันเพื่อโฟกัส ไม่ตัดข้อมูลอื่นหาย</p>
              </div>
            </div>
            <div className="period-control-panel">
              <div className="period-row history-row">
                <span className="period-row-label">ย้อนหลัง</span>
                <div className="period-pill-group" role="tablist" aria-label="ข้อมูลย้อนหลัง">
                  {historyTabs.map((tab) => <button type="button" role="tab" aria-selected={selectedHistory === tab.id} className={selectedHistory === tab.id ? 'is-active' : ''} key={tab.id} onClick={() => setSelectedHistory(tab.id)}>{tab.label}</button>)}
                </div>
              </div>
              <div className="period-row forecast-row">
                <span className="period-row-label">โฟกัสวัน</span>
                <div className="period-pill-group" role="group" aria-label="เลือกวันที่ต้องการโฟกัส">
                  {focusTabs.map((tab) => <button type="button" key={tab.id} aria-pressed={focus === tab.id} className={focus === tab.id ? 'is-active' : ''} onClick={() => { if (!focusAvailable) setSelectedHistory('currentWeek'); setFocus(focus === tab.id ? null : tab.id) }}>{tab.label}</button>)}
                </div>
              </div>
            </div>
          </header>

          <div className={`aq-today-strip${todayAvailable ? ' is-clickable' : ''}`} onClick={todayAvailable ? () => setFocus('today') : undefined} role={todayAvailable ? 'button' : undefined} tabIndex={todayAvailable ? 0 : undefined} aria-pressed={focus === 'today'} onKeyDown={todayAvailable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFocus('today') } } : undefined}>
            <strong>ข้อมูลวันนี้{effectiveProvince && effectiveProvince !== GPS_PROVINCE_KEY ? ` · จังหวัด${effectiveProvince}` : ''} ({formatDate(today)})</strong>
            {todayRow ? <span>{Number(todayRow.value).toFixed(1)} {todayRow.unit} · {todayRow.status} {getEmojiByStatusLabel(todayRow.status)} <Badge row={todayRow} />{focus === 'today' && <small>· กำลังโฟกัส</small>}</span> : todayEstimate ? <span>{Number(todayEstimate.value).toFixed(1)} {todayEstimate.unit} · {todayEstimate.status} {getEmojiByStatusLabel(todayEstimate.status)} <Badge row={todayEstimate} /> <small>รอค่าวัดจริงของวันนี้</small></span> : <span className="aq-today-empty">{selectedHistory === 'currentWeek' ? 'ไม่มีข้อมูลวันนี้ — สถานียังไม่ส่งข้อมูลวันที่ล่าสุด' : 'ช่วงที่เลือกไม่รวมวันนี้ — กด "สัปดาห์นี้" เพื่อดูวันนี้'}</span>}
          </div>

          <div className="aq-metric-row">
            <div className="aq-metric-tabs" role="tablist" aria-label="ตัวชี้วัดคุณภาพอากาศ">
              {['PM2.5', 'AQI'].map((item) => <button type="button" role="tab" aria-selected={metric === item} key={item} className={metric === item ? 'active' : ''} onClick={() => { setMetric(item); setRefetching(true) }}>{item}</button>)}
            </div>
            <span>{metricDescription}</span>
          </div>

          {(refetching || dataFreshness !== 'none') && <p className={`aq-source-status${dataFreshness === 'stale' ? ' is-stale' : ''}`} role="status" aria-live="polite">{forecastLoading ? 'กำลังโหลดผลคาดการณ์ค่าฝุ่น...' : refetching ? 'กำลังโหลดข้อมูล...' : dataNotice || (dataFreshness === 'stale' ? `ข้อมูลสำรองจาก cache — โหลดสำเร็จล่าสุด ${new Date(cachedAt).toLocaleString('th-TH')}` : 'ข้อมูลล่าสุด')}</p>}
          {/* จุดที่ 3: dropdown จังหวัดอิสระของโหมดดูข้อมูลย้อนหลัง — ไม่ผูกกับค่าเริ่มต้น (โปรไฟล์/GPS) */}
          <div className="aq-metric-row">
            <span className="aq-source-status" role="status">
              ดูข้อมูลย้อนหลังของจังหวัด:
              {' '}
              <select
                className="aq-province-select"
                aria-label="เลือกจังหวัดสำหรับดูข้อมูลย้อนหลัง"
                value={effectiveProvince}
                onChange={(event) => {
                  const value = event.target.value
                  setRefetching(true)
                  if (value === GPS_PROVINCE_KEY) { handleUseGps() } else { setBrowseProvince(value) }
                }}
              >
                <option value={GPS_PROVINCE_KEY}>ตำแหน่งปัจจุบัน (GPS)</option>
                {UNIQUE_THAI_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              {mode === 'province' && effectiveProvince !== GPS_PROVINCE_KEY && province && effectiveProvince !== province && (
                <small style={{ marginLeft: 8 }}>กำลังดูจังหวัดอื่น — ค่าเริ่มต้นยังอิงโปรไฟล์</small>
              )}
            </span>
          </div>
          {/* จุดที่ 2: แหล่งค่าเริ่มต้น (โปรไฟล์/GPS) แสดงที่มาชัดเจน + ปุ่ม GPS เป็นตัวเลือกเสริม */}
          <div className="aq-metric-row">
            <span className="aq-source-status" role="status">
              {effectiveProvince === GPS_PROVINCE_KEY ? 'ข้อมูลตามตำแหน่งปัจจุบัน (GPS)' : effectiveProvince ? `ข้อมูลจังหวัดที่เลือก (${effectiveProvince})` : 'ยังไม่ได้ตั้งจังหวัดในโปรไฟล์'}
            </span>
            {mode === 'province' ? (
              <button type="button" className="aq-retry" onClick={handleUseGps}>ใช้ตำแหน่งปัจจุบันแทน</button>
            ) : (
              <button type="button" className="aq-retry" onClick={handleBackToProfileProvince}>กลับไปใช้จังหวัดในโปรไฟล์{province ? ` (${province})` : ''}</button>
            )}
          </div>
          {loading ? <EmptyState loading /> : apiState === 'error' ? (
            <div className="aq-empty-state" role="alert">
              <strong>เกิดข้อผิดพลาด</strong><span>{errorMessage}</span>
              {errorDetails && <><small className="aq-error-code">รหัส: {errorDetails.code}{errorDetails.upstreamStatus ? ` (upstream HTTP ${errorDetails.upstreamStatus})` : ''}</small><small className="aq-error-code">เรียก: {errorDetails.requestUrl} → Backend: {errorDetails.backendUrl}</small></>}
              <button type="button" className="aq-retry" onClick={() => { setApiState('idle'); setAttempt((value) => value + 1) }}>ลองใหม่</button>
            </div>
          ) : apiState === 'no_station_nearby' ? (
            <div className="aq-empty-state" role="status"><strong>ไม่พบสถานีวัดฝุ่นในจังหวัด{province || 'ที่เลือก'}</strong><span>{errorMessage || 'ไม่มีสถานี PM2.5 ในรัศมี 25 กม. จากพื้นที่อ้างอิงของจังหวัดนี้'}</span></div>
          ) : <Chart rows={focusDataMissing ? [] : visibleRows} focusedDate={focusedDate} emptyMessage={focusDataMissing && focusTab?.forecastDays ? forecastUnavailableMessage : 'ยังไม่มีข้อมูลสำหรับวันที่เลือก — เลือกช่วงวันอื่นหรือลองใหม่ภายหลัง'} />}

          <section className="aq-details">
            <h2>รายละเอียดรายวัน</h2>
            {isSensitive && <p className="aq-forecast-note">คำแนะนำทุกวันปรับตามกลุ่มสุขภาพของคุณ (กลุ่มเสี่ยง) จากแบบประเมินและโรคประจำตัว</p>}
            {forecastCount > 0 && focusedForecastRows.length > 0 && <p className="aq-forecast-note">{forecastStale ? 'ข้อมูลพยากรณ์ล้าสมัย (อัปเดตเกิน 2 วัน) · ' : ''}{forecastNote || 'พยากรณ์โดยแบบจำลองระดับโลก CAMS (Copernicus) ผ่าน Open-Meteo ความละเอียด ~45 กม. ไม่ใช่ค่าวัด ณ จุดของคุณ'}{camsStats?.formattedText ? ` · ${camsStats.formattedText}` : ''}{forecastStationCount > 0 ? ` · เฉลี่ยจาก ${forecastStationCount} สถานี` : ''}{forecastUpdatedAt ? ` · อัปเดต ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(forecastUpdatedAt))}` : ''}</p>}
            {forecastCount > 0 && focusDataMissing && apiState !== 'error' && <p className="aq-forecast-note">{forecastUnavailableMessage}</p>}
            {visibleRows.length === 0 ? <p className="aq-table-empty">ยังไม่มีรายละเอียดรายวันสำหรับช่วงที่เลือก</p> : <>
              <div className="aq-table-scroll">
                <table>
                  <thead><tr><th>วันที่</th><th>ค่าเฉลี่ย</th><th>สถานะ</th><th>ประเภท</th><th>คำแนะนำ</th></tr></thead>
                  <tbody>{visibleRows.slice(-10).map((row) => {
                    const emoji = getEmojiByStatusLabel(row.status)
                    const status = row.status || 'ไม่มีข้อมูล'
                    return <tr key={`${row.date}-${row.isForecast}`} className={row.date === focusedDate ? (row.isForecast ? 'is-focused-forecast' : 'is-focused-real') : ''}><td>{formatDate(row.date)}</td><td>{Number(row.value).toFixed(1)} {row.unit}</td><td><span aria-label={`สถานะคุณภาพอากาศ: ${status}`}><span aria-hidden="true">{emoji}</span>{' '}<span>{status}</span></span></td><td><Badge row={row} /></td><td>{row.advice || '-'}</td></tr>
                  })}</tbody>
                </table>
              </div>
              <div className="aq-daily-cards">
                {visibleRows.slice(-10).map((row) => <article className={`aq-day-card${row.date === focusedDate ? (row.isForecast ? ' is-focused-forecast' : ' is-focused-real') : ''}`} key={`${row.date}-${row.isForecast}`}><strong>{formatDate(row.date)}</strong><span>{getEmojiByStatusLabel(row.status)}</span><b>{Number(row.value).toFixed(1)} {row.unit}</b><Badge row={row} /></article>)}
              </div>
            </>}
          </section>
        </section>
      </div>
    </main>
  )
}
