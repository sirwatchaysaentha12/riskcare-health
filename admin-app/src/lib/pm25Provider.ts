/**
 * pm25Provider.ts — Provider interface รวม PCD/Air4Thai + OpenAQ (optional fallback)
 *
 * ลำดับ fallback:
 *   1. PCD/Air4Thai  ← primary (ไม่ต้อง key, ข้อมูลไทยโดยตรง)
 *   2. OpenAQ        ← เฉพาะเมื่อ key ใช้งานได้ (OPENAQ_API_KEY ตรวจสอบก่อนเสมอ)
 *   3. ไม่มีข้อมูล  ← คืน null — caller รายงานต่อผู้ใช้
 *
 * กฎ:
 * - OPENAQ_AUTH_FAILED ไม่ทำให้ pipeline ล้ม → ข้ามขั้น OpenAQ, status = degraded
 * - ห้าม throw ข้ามฟังก์ชัน fetchPcd* หรือ fetchOpenAQ* (ต้อง catch ภายใน)
 * - ไม่พิมพ์ค่า secret ในทุกกรณี
 * - จับคู่จังหวัด→สถานีจากข้อมูล pm25Stations (ไม่ใช้พิกัดผ่าน OpenAQ)
 */
import https from 'node:https'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type Pm25DailyPoint = { date: string; pm25: number }

export type ProviderResult = {
  points: Pm25DailyPoint[]
  provider: 'pcd' | 'openaq' | 'none'
  status: 'ok' | 'degraded' | 'empty'
  /** สถานี/sensor ID ที่ใช้จริง (debug ได้) */
  sourceId: string | null
  error: string | null
}

export type CurrentPm25Result = {
  pm25: number | null
  provider: 'pcd' | 'openaq' | 'none'
  status: 'ok' | 'degraded' | 'empty'
  stationCode: string | null
  stationName: string | null
  updatedAt: string | null
  error?: string | null
}

// ────────────────────────────────────────────────────────────────────────────
// PCD / Air4Thai helpers
// ────────────────────────────────────────────────────────────────────────────

const AIR4THAI_URL = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php'
const USER_AGENT = 'RiskCARE-Demo/1.0 (student project; contact via repository)'

type Air4ThaiStation = {
  stationID?: string
  nameTH?: string
  nameEN?: string
  areaTH?: string
  areaEN?: string
  stationType?: string
  lat?: number | string
  long?: number | string
  AQILast?: {
    PM25?: { value?: number | string; color?: string; aqi?: number | string }
    date?: string
    time?: string
  }
}
type Air4ThaiResponse = { stations?: Air4ThaiStation[] }

// ใช้ node:https เพราะ TLS chain ของ air4thai ไม่ครบ (UNABLE_TO_VERIFY_LEAF_SIGNATURE)
function fetchAir4Thai(timeoutMs = 10000): Promise<Air4ThaiResponse | null> {
  return new Promise((resolve) => {
    const req = https.get(
      AIR4THAI_URL,
      {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        timeout: timeoutMs,
        rejectUnauthorized: false, // TLS chain ไม่ครบ — ข้อมูลสาธารณะ display-only
      },
      (res) => {
        if ((res.statusCode ?? 500) >= 400) {
          res.resume()
          resolve(null)
          return
        }
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { raw += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(raw) as Air4ThaiResponse) }
          catch { resolve(null) }
        })
      },
    )
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

/** จับคู่จังหวัด → สถานี Air4Thai ที่ตรงที่สุด
 *  ใช้ areaTH/areaEN/nameTH/nameEN — ไม่ต้องใช้พิกัด OpenAQ
 */
function matchStationByProvince(stations: Air4ThaiStation[], province: string): Air4ThaiStation | null {
  if (!province || !stations.length) return null
  const norm = (s: string) =>
    String(s).toLocaleLowerCase('th-TH').replace(/จังหวัด|จ\.|province|prov\.?\s*/gi, '').replace(/\s+/g, '')
  const target = norm(province)
  // ลำดับ: areaTH ตรงก่อน, nameTH รอง, nameEN สุดท้าย
  return (
    stations.find((st) => norm(st.areaTH || '') === target) ??
    stations.find((st) => norm(st.areaTH || '').includes(target)) ??
    stations.find((st) => norm(st.nameTH || '').includes(target)) ??
    stations.find((st) => norm(st.areaEN || '').includes(target)) ??
    null
  )
}

/** ดึงค่า PM2.5 ปัจจุบันจาก PCD สำหรับจังหวัด */
export async function fetchPcdCurrent(province: string): Promise<CurrentPm25Result> {
  const empty: CurrentPm25Result = { pm25: null, provider: 'none', status: 'empty', stationCode: null, stationName: null, updatedAt: null }
  try {
    const payload = await fetchAir4Thai()
    if (!payload?.stations?.length) return { ...empty, provider: 'pcd', status: 'degraded', error: 'PCD_NO_DATA' } as CurrentPm25Result
    const station = matchStationByProvince(payload.stations, province)
    if (!station) return { ...empty, provider: 'pcd', status: 'empty' }
    const pm25Raw = station.AQILast?.PM25?.value
    const pm25 = pm25Raw != null ? Number(pm25Raw) : null
    if (pm25 == null || !Number.isFinite(pm25) || pm25 < 0) return { ...empty, provider: 'pcd', status: 'empty' }
    const date = station.AQILast?.date ?? null
    const time = station.AQILast?.time ?? null
    const updatedAt = date && time ? `${date}T${time}+07:00` : null
    return {
      pm25,
      provider: 'pcd',
      status: 'ok',
      stationCode: station.stationID ?? null,
      stationName: station.nameTH ?? station.nameEN ?? null,
      updatedAt,
    }
  } catch {
    return { ...empty, provider: 'pcd', status: 'degraded', error: 'PCD_FETCH_FAILED' } as CurrentPm25Result
  }
}

/** รวบรวมค่ารายวันสะสมจาก PCD ผ่านการเรียกซ้ำ (PCD ไม่มี history endpoint — เก็บค่าปัจจุบันสะสมเอง)
 *  NOTE: PCD/Air4Thai ไม่มี REST endpoint สำหรับ historical data ต่างจาก OpenAQ
 *  → ตอบ points=[] (caller ใช้ Supabase air_quality_daily แทน)
 */
export async function fetchPcdHistory(_province: string, _days: number): Promise<ProviderResult> {
  // PCD ไม่มี history endpoint จริง — caller ควรอ่านจาก Supabase air_quality_daily
  return { points: [], provider: 'pcd', status: 'empty', sourceId: null, error: 'PCD_NO_HISTORY_ENDPOINT' }
}

// ────────────────────────────────────────────────────────────────────────────
// OpenAQ helpers (optional — ใช้เฉพาะเมื่อ key ใช้ได้)
// ────────────────────────────────────────────────────────────────────────────

const OPENAQ_API_URL = 'https://api.openaq.org/v3'

/** ตรวจสอบ key โดยไม่พิมพ์ค่า — คืน null เมื่อ missing/empty/malformed */
export function getOpenAQKeyIfValid(): string | null {
  const key = process.env.OPENAQ_API_KEY
  if (!key || key.trim().length < 8) return null
  return key.trim()
}

async function openaqFetch<T>(path: string, apiKey: string, timeoutMs = 12000): Promise<T | null> {
  try {
    const res = await fetch(`${OPENAQ_API_URL}${path}`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status === 401 || res.status === 403) {
      console.warn('[pm25Provider] OpenAQ auth failed — skipping OpenAQ step, status=degraded')
      return null // OPENAQ_AUTH_FAILED → ไม่ throw, ข้ามขั้น
    }
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

type OAQLocationsResp = { results?: Array<{ id: number; name?: string; sensors?: Array<{ id: number; parameter?: { id?: number } }> }> }
type OAQDailyResp = { results?: Array<{ value?: number; period?: { datetimeFrom?: { local?: string; utc?: string } } }>; meta?: { found?: number } }

/** ค้นหา sensorId ที่ตรงกับพิกัดจากข้อมูลสถานีในเว็บ (ไม่ใช้พิกัดผ่าน OpenAQ โดยตรง) */
export async function fetchOpenAQHistoryBySensorId(sensorId: number, fromDate: string, toDate: string): Promise<ProviderResult> {
  const apiKey = getOpenAQKeyIfValid()
  if (!apiKey) return { points: [], provider: 'openaq', status: 'degraded', sourceId: null, error: 'OPENAQ_KEY_UNAVAILABLE' }

  const query = new URLSearchParams({
    datetime_from: `${fromDate}T00:00:00+07:00`,
    datetime_to: `${toDate}T23:59:59+07:00`,
    limit: '1000',
  })
  const data = await openaqFetch<OAQDailyResp>(`/sensors/${sensorId}/measurements/daily?${query}`, apiKey)
  if (!data) return { points: [], provider: 'openaq', status: 'degraded', sourceId: String(sensorId), error: 'OPENAQ_FETCH_FAILED' }

  const byDate = new Map<string, number[]>()
  for (const item of data.results ?? []) {
    const value = Number(item.value)
    const date = String(item.period?.datetimeFrom?.local ?? item.period?.datetimeFrom?.utc ?? '').slice(0, 10)
    if (Number.isFinite(value) && value >= 0 && date && date >= fromDate && date <= toDate) {
      const arr = byDate.get(date) ?? []
      arr.push(value)
      byDate.set(date, arr)
    }
  }
  const points: Pm25DailyPoint[] = [...byDate.entries()]
    .map(([date, vals]) => ({ date, pm25: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { points, provider: 'openaq', status: points.length ? 'ok' : 'empty', sourceId: String(sensorId), error: null }
}

// ────────────────────────────────────────────────────────────────────────────
// Unified provider — ใช้ใน pipeline
// ────────────────────────────────────────────────────────────────────────────

/** ดึงค่า PM2.5 ปัจจุบัน: PCD ก่อน, OpenAQ เป็น fallback (ถ้า key ใช้ได้)
 *  ไม่ throw ไม่แสดง traceback
 */
export async function getProviderCurrent(province: string): Promise<CurrentPm25Result> {
  const pcdResult = await fetchPcdCurrent(province)
  if (pcdResult.status === 'ok') return pcdResult

  // fallback: OpenAQ — เฉพาะเมื่อ key มี
  console.info('[pm25Provider] PCD current not ok, trying OpenAQ fallback')
  const apiKey = getOpenAQKeyIfValid()
  if (!apiKey) return { ...pcdResult, status: 'degraded', error: 'PCD_AND_OPENAQ_UNAVAILABLE' }

  // OpenAQ current: อ่านจาก locations nearby ด้วย lat/lon — แต่เรายังไม่มีพิกัดจากพารามิเตอร์
  // ← ต้องส่งพิกัดมา ณ จุดนี้ (caller ต้องระบุ) → คืน degraded ถ้าไม่มี
  return { ...pcdResult, status: 'degraded', error: 'OPENAQ_FALLBACK_NEEDS_COORDS' }
}
