import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getAqiEmoji } from '../utils/aqiStatus'
import { getPersonalizedAudience } from '../utils/personalizedPm25'
import { fetchAirQualityDashboard } from '../services/airQualityDashboard'

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

function formatDate(value) {
  return new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`))
}

function EmptyState({ loading = false, message = '' }) {
  return <div className="aq-empty-state"><strong>{loading ? 'กำลังโหลดข้อมูล...' : message || 'ยังไม่มีข้อมูลคุณภาพอากาศ'}</strong>{!loading && !message && <span>กรุณาเชื่อมต่อ API หรือเพิ่มข้อมูลจริงในระบบ</span>}</div>
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

function Chart({ rows, focusedDate }) {
  if (!rows.length) return <EmptyState message="ยังไม่มีข้อมูลในช่วงเวลานี้" />
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
  return <div className="aq-chart-scroll"><svg className="aq-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="กราฟแนวโน้ม PM2.5"><defs><linearGradient id="aq-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9de1cc" stopOpacity=".72" /><stop offset="1" stopColor="#effaf7" stopOpacity=".08" /></linearGradient></defs><g className="aq-chart-grid"><line x1="40" y1="80" x2="1060" y2="80" /><line x1="40" y1="145" x2="1060" y2="145" /><line x1="40" y1="210" x2="1060" y2="210" /></g><path d={area} className="aq-chart-area" /><path d={line} className="aq-chart-line" />{focused && <line x1={focused.x} y1={30} x2={focused.x} y2={height - bottom} className={`aq-chart-focus-line ${focused.isForecast ? 'is-forecast' : 'is-real'}`} />}{points.map((point, index) => <g key={`${point.date}-${point.value}`}>{showLabel(index) && <text x={point.x} y={point.y - 14} className="aq-chart-value">{point.value.toFixed(1)}</text>}<circle cx={point.x} cy={point.y} r={point.date === focusedDate ? 7 : 5} className={`aq-chart-point${point.date === focusedDate ? ' is-focused' : ''}`} />{showLabel(index) && <text x={point.x} y="265" className="aq-chart-label">{formatDate(point.date)}</text>}</g>)}</svg></div>
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
  const [coords, setCoords] = useState(null)
  const [geoStatus, setGeoStatus] = useState('asking') // 'asking' | 'granted' | 'denied'
  const [attempt, setAttempt] = useState(0)
  const [refetching, setRefetching] = useState(false) // indicator ตอนเปลี่ยนหน้าต่าง/metric (ข้อมูลเก่ายังโชว์ระหว่างรอ)
  const [isSensitive, setIsSensitive] = useState(false) // กลุ่มสุขภาพของผู้ใช้ → คำแนะนำเฉพาะบุคคล
  const [modelVersion, setModelVersion] = useState(null) // เวอร์ชันโมเดลที่ให้ค่าพยากรณ์ (ย้อนตรวจได้)
  const [forecastNote, setForecastNote] = useState('') // คำอธิบายที่มาของค่าพยากรณ์จาก backend
  const [todayEstimate, setTodayEstimate] = useState(null) // ประมาณการของวันนี้ (เมื่อสถานียังไม่ส่งค่าวัดจริง)
  const geoSupported = typeof navigator !== 'undefined' && Boolean(navigator.geolocation)
  const history = historyTabs.find((tab) => tab.id === selectedHistory) || historyTabs[0]
  const setSelectedHistory = (value) => { setSelectedHistoryState(value); setSelectedModeOff(); setRefetching(true) }
  const setSelectedModeOff = () => { setFocus((current) => (current && current !== 'today' ? null : current)) }
  const today = bangkokToday()
  const todayRow = rows.find((row) => row.date === today)

  useEffect(() => {
    if (!geoSupported) return
    navigator.geolocation.getCurrentPosition(
      (position) => { setCoords({ lat: position.coords.latitude, lon: position.coords.longitude }); setGeoStatus('granted') },
      () => setGeoStatus('denied'),
      { timeout: 10000, maximumAge: 600000 },
    )
  }, [attempt, geoSupported])

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
    if (!coords) return undefined
    let active = true
    const controller = new AbortController()
    const url = `${API_URL}?period=${history.id}&metric=${encodeURIComponent(metric)}&lat=${coords.lat}&lon=${coords.lon}&risk=${isSensitive ? 'sensitive' : 'general'}`
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
        setRows([]); setForecastRows([]); setFocus(null); setTodayEstimate(null); setModelVersion(null); setForecastNote('')
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
          ? 'OpenAQ ปฏิเสธการยืนยันตัวตน'
          : upstreamStatus === 403
            ? 'บัญชีไม่มีสิทธิ์เข้าถึงข้อมูล OpenAQ นี้'
            : upstreamStatus === 404
              ? 'ไม่พบสถานีหรือข้อมูลที่ร้องขอจาก OpenAQ'
              : upstreamStatus === 429
                ? 'OpenAQ จำกัดจำนวนคำขอชั่วคราว'
                : upstreamStatus >= 500
                  ? 'บริการ OpenAQ ขัดข้องชั่วคราว'
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
      .finally(() => { if (active) setRefetching(false) })
    return () => { active = false; controller.abort() }
  }, [history.id, metric, coords, attempt, today, isSensitive])

  const loading = apiState === 'idle'
  const effectiveGeoStatus = !geoSupported ? 'unavailable' : geoStatus
  // ปุ่มโฟกัสวันใช้ได้เฉพาะช่วง "สัปดาห์นี้" — หน้าต่างเก่า (สัปดาห์ที่แล้วขึ้นไป) ไม่มีวันนี้/พรุ่งนี้
  // อยู่ในช่วงข้อมูล ถ้าบังคับแสดงกราฟจะเหลื่อมวันหลอกตา (จุดเรียงตาม index ไม่ใช่ตามวันจริง)
  const focusAvailable = selectedHistory === 'currentWeek'
  const focusTab = focusTabs.find((tab) => tab.id === focus) || null
  const forecastCount = focusAvailable ? (focusTab?.forecastDays ?? 0) : 0
  // โฟกัสวันพยากรณ์ → กราฟแสดง 3 วันจริงท้ายสุดนำหน้า ให้เห็นการไหลจากของจริงไปคาดการณ์
  const visibleRows = forecastCount > 0 ? [...rows.slice(-3), ...forecastRows.slice(0, forecastCount)] : rows
  const focusedDate = focus === 'today'
    ? todayRow?.date
    : focusTab ? forecastRows[forecastCount - 1]?.date : null
  const todayAvailable = Boolean(todayRow)

  if (!coords && effectiveGeoStatus !== 'granted') {
    return <main className="aq-page"><div className="aq-shell"><button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button><section className="aq-card"><div className="aq-empty-state"><strong>{effectiveGeoStatus === 'denied' ? 'ยังไม่ได้อนุญาตการเข้าถึงตำแหน่ง' : effectiveGeoStatus === 'unavailable' ? 'อุปกรณ์นี้ระบุตำแหน่งไม่ได้' : 'กำลังระบุตำแหน่งของคุณ...'}</strong><span>ระบบใช้ตำแหน่งของคุณค้นหาสถานีวัดฝุ่น PM2.5 ที่ใกล้ที่สุดเท่านั้น ข้อมูลจะแสดงเฉพาะพื้นที่ของคุณ</span>{effectiveGeoStatus !== 'asking' && <button type="button" className="aq-retry" onClick={() => { setGeoStatus('asking'); setAttempt((value) => value + 1) }}>ลองอีกครั้ง</button>}</div></section></div></main>
  }

  return <main className="aq-page"><div className="aq-shell"><button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button><section className="aq-card"><header className="aq-header"><div className="aq-heading"><span className="aq-leaf" aria-hidden="true">🍃</span><div><h1>แนวโน้มคุณภาพอากาศ</h1><p>ติดตามค่าคุณภาพอากาศย้อนหลังและคาดการณ์ — กดปุ่มวันเพื่อโฟกัส ไม่ตัดข้อมูลอื่นหาย</p></div></div><div className="period-control-panel"><div className="period-row history-row"><span className="period-row-label">ย้อนหลัง</span><div className="period-pill-group" role="tablist" aria-label="ข้อมูลย้อนหลัง">{historyTabs.map((tab) => <button type="button" role="tab" aria-selected={selectedHistory === tab.id} className={selectedHistory === tab.id ? 'is-active' : ''} key={tab.id} onClick={() => setSelectedHistory(tab.id)}>{tab.label}</button>)}</div></div><div className="period-row forecast-row"><span className="period-row-label">โฟกัสวัน</span><div className="period-pill-group" aria-label="เลือกวันที่ต้องการโฟกัส">{focusTabs.map((tab) => <button type="button" key={tab.id} aria-pressed={focus === tab.id} className={focus === tab.id ? 'is-active' : ''} disabled={!focusAvailable || (tab.id === 'today' ? !todayAvailable : forecastRows.length < tab.forecastDays)} title={!focusAvailable ? 'โฟกัสวันใช้ได้เฉพาะช่วงสัปดาห์นี้' : tab.id === 'today' && !todayAvailable ? 'ไม่มีข้อมูลวันนี้จากสถานีที่เลือก' : undefined} onClick={() => setFocus(focus === tab.id ? null : tab.id)}>{tab.label}</button>)}</div></div></div></header><div className={`aq-today-strip${todayAvailable ? ' is-clickable' : ''}`} onClick={todayAvailable ? () => setFocus('today') : undefined} role={todayAvailable ? 'button' : undefined} aria-pressed={focus === 'today'}><strong>ข้อมูลวันนี้ ({formatDate(today)})</strong>{todayRow ? <span>{Number(todayRow.value).toFixed(1)} {todayRow.unit} · {todayRow.status} {getAqiEmoji(Number(todayRow.value))} <Badge row={todayRow} />{focus === 'today' && <small>· กำลังโฟกัส</small>}</span> : todayEstimate ? <span>{Number(todayEstimate.value).toFixed(1)} {todayEstimate.unit} · {todayEstimate.status} {getAqiEmoji(Number(todayEstimate.value))} <Badge row={todayEstimate} /> <small>รอค่าวัดจริงของวันนี้</small></span> : <span className="aq-today-empty">{selectedHistory === 'currentWeek' ? 'ไม่มีข้อมูลวันนี้ — สถานียังไม่ส่งข้อมูลวันที่ล่าสุด' : 'ช่วงที่เลือกไม่รวมวันนี้ — กด "สัปดาห์นี้" เพื่อดูวันนี้'}</span>}</div><div className="aq-metric-row"><div className="aq-metric-tabs">{['PM2.5', 'AQI'].map((item) => <button type="button" key={item} className={metric === item ? 'active' : ''} onClick={() => { setMetric(item); setRefetching(true) }}>{item}</button>)}</div><span>PM2.5 ค่าฝุ่นละอองขนาดเล็กเฉลี่ยรายวัน</span></div>{dataFreshness !== 'none' && <p className={`aq-source-status${dataFreshness === 'stale' ? ' is-stale' : ''}`} role="status">{dataFreshness === 'stale' ? `ข้อมูลสำรองจาก cache — โหลดสำเร็จล่าสุด ${new Date(cachedAt).toLocaleString('th-TH')}` : 'ข้อมูลสดจาก OpenAQ'}</p>}{refetching && <p className="aq-loading-note">กำลังโหลดข้อมูลช่วงเวลาใหม่...</p>}{loading ? <EmptyState loading /> : apiState === 'error' ? <div className="aq-empty-state"><strong>เกิดข้อผิดพลาด</strong><span>{errorMessage}</span>{errorDetails && <><small className="aq-error-code">รหัส: {errorDetails.code}{errorDetails.upstreamStatus ? ` (upstream HTTP ${errorDetails.upstreamStatus})` : ''}</small><small className="aq-error-code">เรียก: {errorDetails.requestUrl} → Backend: {errorDetails.backendUrl}</small></>}<button type="button" className="aq-retry" onClick={() => { setApiState('idle'); setAttempt((value) => value + 1) }}>ลองใหม่</button></div> : apiState === 'no_station_nearby' ? <div className="aq-empty-state"><strong>ไม่พบสถานีวัดฝุ่นใกล้คุณ</strong><span>{errorMessage || 'ไม่มีสถานี PM2.5 ในรัศมี 25 กม. จากตำแหน่งของคุณ'}</span></div> : <Chart rows={visibleRows} focusedDate={focusedDate} />}<section className="aq-details"><h2>รายละเอียดรายวัน</h2>{isSensitive && <p className="aq-forecast-note" style={{ color: '#1f6f5c' }}>คำแนะนำทุกวันปรับตามกลุ่มสุขภาพของคุณ (กลุ่มเสี่ยง) จากแบบประเมินและโรคประจำตัว</p>}{forecastCount > 0 && <p className="aq-forecast-note">{forecastNote || 'คาดการณ์จากแนวโน้มย้อนหลัง — ไม่ใช่ข้อมูลจริง'}{modelVersion ? ` · โมเดล: ${modelVersion}` : ''}</p>}<div className="aq-table-scroll"><table><thead><tr><th>วันที่</th><th>ค่าเฉลี่ย</th><th>สถานะ</th><th>ประเภท</th><th>คำแนะนำ</th></tr></thead><tbody>{visibleRows.slice(-10).map((row) => <tr key={`${row.date}-${row.isForecast}`} className={row.date === focusedDate ? (row.isForecast ? 'is-focused-forecast' : 'is-focused-real') : ''}><td>{formatDate(row.date)}</td><td>{Number(row.value).toFixed(1)} {row.unit}</td><td>{row.status}</td><td><Badge row={row} /></td><td>{row.advice || '-'}</td></tr>)}</tbody></table></div></section><div className="aq-daily-cards">{visibleRows.slice(-10).map((row) => <article className={`aq-day-card${row.date === focusedDate ? (row.isForecast ? ' is-focused-forecast' : ' is-focused-real') : ''}`} key={`${row.date}-${row.isForecast}`}><strong>{formatDate(row.date)}</strong><span>{getAqiEmoji(Number(row.value))}</span><b>{Number(row.value).toFixed(1)} {row.unit}</b><Badge row={row} /></article>)}</div></section></div></main>
}
