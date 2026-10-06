import { airQualityConfig } from '@/lib/airQualityConfig'
import { OpenAQConfigurationError, UpstreamRequestError } from '@/lib/openAqErrors'
import { sanitizeApiKey } from '@/lib/apiKeySanitize'
import { haversineKm, isValidLatLng, type StationCandidate } from '@/lib/openAQStations'

const AIR4THAI_URL = 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php'
const OPENAQ_API_URL = 'https://api.openaq.org/v3'

export type OpenAQParameter = { id?: number; name?: string; units?: string }
export type OpenAQSensor = { id: number; parameter?: OpenAQParameter; parameter_id?: number }
export type OpenAQLocation = { id: number; name?: string; coordinates?: { latitude?: number; longitude?: number }; provider?: { name?: string }; sensors?: OpenAQSensor[] }
export type OpenAQMeasurement = { value?: number | string; period?: { datetimeFrom?: { utc?: string; local?: string }; datetime?: { utc?: string } }; datetime?: { utc?: string } }
type OpenAQLocationsResponse = { results?: OpenAQLocation[] }
type OpenAQMeasurementsResponse = { results?: OpenAQMeasurement[]; meta?: { found?: number } }
type Air4ThaiStation = { lat?: number | string; long?: number | string; stationID?: string; AQILast?: { PM25?: { value?: number | string } } }
type Air4ThaiResponse = { stations?: Air4ThaiStation[] }

export type Pm25HistoryPoint = { date: string; pm25: number }

export type OpenAQStation = StationCandidate

// in-memory cache สำหรับผลค้นหาสถานี: key = พิกัดปัด 2 ตำแหน่ง, TTL 1 ชั่วโมง
const STATION_CACHE_TTL_MS = 60 * 60 * 1000
const stationCache = new Map<string, { stations: OpenAQStation[]; expiresAt: number }>()

// ค้นหาสถานี PM2.5 ใกล้สุดจากพิกัด (รัศมี 25 กม.) — เลือกจาก provider Air4Thai ก่อนถ้ามี
// คืน null เมื่อไม่มีสถานีในรัศมี (caller ต้องรายงานสถานะนี้ ห้าม fallback เงียบ ๆ)
export async function findNearestOpenAQStation(lat: number, lon: number): Promise<OpenAQStation | null> {
  const stations = await findOpenAQStations(lat, lon)
  return stations[0] ?? null
}

// คืนรายการสถานีเรียงตามลำดับความชอบ (Air4Thai ใกล้สุดก่อน แล้วตามด้วยสถานีอื่นใกล้สุด)
// caller ใช้ลำดับนี้ลองดึงข้อมูลรายวันทีละสถานี — สถานีที่ daily endpoint พัง/ไม่มีข้อมูลจะข้ามไปตัวถัดไป
export async function findOpenAQStations(lat: number, lon: number): Promise<OpenAQStation[]> {
  if (!isValidLatLng(lat, lon)) throw new Error('INVALID_COORDINATES')
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const cached = stationCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.stations

  const apiKey = getApiKey()
  const payload = await fetchJson<OpenAQLocationsResponse>(
    `${OPENAQ_API_URL}/locations?coordinates=${encodeURIComponent(`${lat},${lon}`)}&radius=25000&parameters_id=2&limit=100`,
    { 'X-API-Key': apiKey },
  )
  // แต่ละสถานีอาจมี sensor PM2.5 หลายตัว (OpenAQ เคยเพิ่ม sensor ใหม่ที่ daily rollup พัง 500
  // คู่กับตัวเดิมที่ใช้ได้ — เกิดจริง 2026-09-25) จึงผลิต candidate ครบทุก sensor
  // ให้ caller ลองทีละตัวและข้ามตัวที่พังเอง
  const seenSensorIds = new Set<number>()
  const candidates: OpenAQStation[] = (payload.results || []).flatMap((item) => {
    const sensors = (item.sensors || []).filter((entry) => entry.parameter?.id === 2 || entry.parameter_id === 2)
    const latitude = Number(item.coordinates?.latitude)
    const longitude = Number(item.coordinates?.longitude)
    if (!sensors.length || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
    const distanceKm = haversineKm(lat, lon, latitude, longitude)
    return sensors
      .filter((sensor) => !seenSensorIds.has(sensor.id) && (seenSensorIds.add(sensor.id), true))
      .map((sensor) => ({
        locationId: item.id,
        sensorId: sensor.id,
        stationName: item.name || `Location ${item.id}`,
        provider: item.provider?.name || 'unknown',
        distanceKm,
        latitude,
        longitude,
      }))
  })
  const air4thai = candidates.filter((station) => /air\s*4\s*thai/i.test(station.provider)).sort((a, b) => a.distanceKm - b.distanceKm)
  const others = candidates.filter((station) => !air4thai.includes(station)).sort((a, b) => a.distanceKm - b.distanceKm)
  const stations = [...air4thai, ...others]
  stationCache.set(cacheKey, { stations, expiresAt: Date.now() + STATION_CACHE_TTL_MS })
  return stations
}

function endpointPath(url: string): string {
  try { return new URL(url).pathname } catch { return 'unknown' }
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const path = endpointPath(url)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    const code = error instanceof Error ? error.name : 'NETWORK_ERROR'
    console.error('[OpenAQ] request failed', { step: 'fetch', endpointPath: path, code })
    throw new Error(`OPENAQ_NETWORK_ERROR:${code}`)
  }
  if (!response.ok) {
    console.error('[OpenAQ] upstream error', { step: 'fetch', endpointPath: path, upstreamStatus: response.status })
    throw new UpstreamRequestError(response.status, path)
  }
  try {
    return await response.json() as T
  } catch {
    const error = new Error('OPENAQ_INVALID_RESPONSE')
    console.error('[OpenAQ] invalid JSON response', { step: 'parse', endpointPath: path })
    throw error
  }
}

export function getApiKey(): string {
  const rawApiKey = process.env.OPENAQ_API_KEY
  if (rawApiKey === undefined) throw new OpenAQConfigurationError('missing')
  const sanitized = sanitizeApiKey(rawApiKey)
  if (!sanitized.ok) throw new OpenAQConfigurationError(sanitized.status)
  console.info('[OpenAQ] configuration:', 'present')
  return sanitized.apiKey
}

export async function getOpenAQHistory(lat: number, lon: number, days: number): Promise<Pm25HistoryPoint[]> {
  const apiKey = getApiKey()
  const locations = await fetchJson<OpenAQLocationsResponse>(
    `${OPENAQ_API_URL}/locations?coordinates=${encodeURIComponent(`${lat},${lon}`)}&radius=25000&parameters_id=2`,
    { 'X-API-Key': apiKey },
  )
  const configuredLocationId = airQualityConfig.locationId
  const location = configuredLocationId
    ? (locations.results || []).find((item) => String(item.id) === configuredLocationId)
    : (locations.results || []).find((item) =>
      (item.sensors || []).some((sensor) => sensor.parameter?.id === 2 || sensor.parameter_id === 2),
    )
  const sensor = airQualityConfig.pm25SensorId
    ? location?.sensors?.find((item) => String(item.id) === airQualityConfig.pm25SensorId)
    : location?.sensors?.find((item) => item.parameter?.id === 2 || item.parameter_id === 2)
  if (!sensor) return []

  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const measurements = await fetchJson<OpenAQMeasurementsResponse>(
    `${OPENAQ_API_URL}/sensors/${sensor.id}/measurements?date_from=${start.toISOString()}&date_to=${end.toISOString()}&limit=1000`,
    { 'X-API-Key': apiKey },
  )
  const byDate = new Map<string, number[]>()
  for (const item of measurements.results || []) {
    const value = Number(item.value)
    const date = String(item.period?.datetimeFrom?.utc || item.datetime?.utc || '').slice(0, 10)
    if (Number.isFinite(value) && date) byDate.set(date, [...(byDate.get(date) || []), value])
  }
  return [...byDate.entries()]
    .map(([date, values]) => ({ date, pm25: values.reduce((sum, value) => sum + value, 0) / values.length }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ดึงค่าเฉลี่ยรายวันของ sensor เดียวจาก endpoint ทางการ /v3/sensors/{id}/measurements/daily
// daily rollups ของ OpenAQ ตัดขอบเขตวันที่เที่ยงคืน Asia/Bangkok อยู่แล้ว (period.datetimeFrom.local = +07:00)
// หมายเหตุ: endpoint นี้ไม่กรองช่วงวันให้ (ทดสอบจริง 2026-09-24) จึงดึงหน้าท้าย ๆ มาแล้วกรอง [fromDate, toDate] เอง
// คืนข้อมูลเรียงวันเก่าไปใหม่ ไม่เติมวันที่ไม่มีข้อมูล
export async function getOpenAQDailyHistory(sensorId: number, fromDate: string, toDate: string): Promise<Pm25HistoryPoint[]> {
  const apiKey = getApiKey()
  const fetchPage = (page: number) => {
    const query = new URLSearchParams({
      datetime_from: `${fromDate}T00:00:00+07:00`,
      datetime_to: `${toDate}T23:59:59+07:00`,
      limit: '1000',
      page: String(page),
    })
    return fetchJson<OpenAQMeasurementsResponse>(
      `${OPENAQ_API_URL}/sensors/${sensorId}/measurements/daily?${query}`,
      { 'X-API-Key': apiKey },
    )
  }
  const first = await fetchPage(1)
  const results = [...(first.results || [])]
  const found = Number(first.meta?.found || results.length)
  const lastPage = Math.min(Math.ceil(found / 1000), 5)
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await fetchPage(page)
    results.push(...(next.results || []))
  }

  const byDate = new Map<string, number[]>()
  for (const item of results) {
    const value = Number(item.value)
    const date = String(item.period?.datetimeFrom?.local || item.period?.datetimeFrom?.utc || '').slice(0, 10)
    if (Number.isFinite(value) && date && date >= fromDate && date <= toDate) {
      byDate.set(date, [...(byDate.get(date) || []), value])
    }
  }
  return [...byDate.entries()]
    .map(([date, values]) => ({ date, pm25: values.reduce((sum, value) => sum + value, 0) / values.length }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export type HourlyMeasurementPoint = { tsUtc: string; pm25: number }

// ดึงค่าวัดรายชั่วโมงล่าสุดของ sensor (endpoint ทางการ /measurements/hourly — รองรับ datetime filter)
// ใช้สำหรับโหมดพยากรณ์รายชั่วโมง: เรียงเก่า→ใหม่, กรองช่วงเวลาเป็น +07:00, dt_to บีบไม่เกิน now (422 ถ้าอนาคต)
export async function getOpenAQRecentHourly(sensorId: number, hoursBack = 12): Promise<HourlyMeasurementPoint[]> {
  const apiKey = getApiKey()
  const end = new Date()
  const start = new Date(end.getTime() - hoursBack * 60 * 60 * 1000)
  const query = new URLSearchParams({
    datetime_from: start.toISOString(),
    datetime_to: end.toISOString(),
    limit: '1000',
  })
  const measurements = await fetchJson<OpenAQMeasurementsResponse>(
    `${OPENAQ_API_URL}/sensors/${sensorId}/measurements/hourly?${query}`,
    { 'X-API-Key': apiKey },
  )
  const points: HourlyMeasurementPoint[] = (measurements.results || [])
    .map((item) => {
      const value = Number(item.value)
      const tsUtc = String(item.period?.datetimeFrom?.utc || item.datetime?.utc || '')
      return { tsUtc, pm25: value }
    })
    .filter((p) => Number.isFinite(p.pm25) && p.tsUtc)
  return points.sort((a, b) => a.tsUtc.localeCompare(b.tsUtc))
}

export async function compareOpenAQWithAir4Thai(lat: number, lon: number, openAQLatest: number) {
  const payload = await fetchJson<Air4ThaiResponse>(AIR4THAI_URL)
  const stations = payload.stations || []
  const nearest = stations
    .map((station) => ({ station, distance: Math.hypot(Number(station.lat) - lat, Number(station.long) - lon) }))
    .sort((a, b) => a.distance - b.distance)[0]?.station
  const air4thaiValue = Number(nearest?.AQILast?.PM25?.value)
  if (Number.isFinite(openAQLatest) && Number.isFinite(air4thaiValue) && air4thaiValue !== 0) {
    const difference = Math.abs(openAQLatest - air4thaiValue) / Math.abs(air4thaiValue)
    if (difference > 0.2) console.warn('[PM2.5] OpenAQ vs Air4Thai differs by more than 20%', { openAQLatest, air4thaiValue, difference })
  }
  return { air4thaiValue: Number.isFinite(air4thaiValue) ? air4thaiValue : null, station: nearest?.stationID || null }
}
