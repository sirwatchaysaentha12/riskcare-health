/**
 * openMeteoClient.ts — Server-side client for Open-Meteo Air Quality (CAMS model)
 *
 * Rules:
 * - Reads OPEN_METEO_API_KEY / OPENMETEO_API_KEY (server-side only, NO prefix VITE_/NEXT_PUBLIC_)
 * - Host: customer-air-quality-api.open-meteo.com if key exists, else air-quality-api.open-meteo.com
 * - Params: hourly=pm2_5 ONLY (no us_aqi / european_aqi)
 * - Timezone: Asia/Bangkok
 * - Aggregation: Daily average requires >= 18 valid hours out of 24. Less than 18 hours = null (no interpolation).
 * - History: past_days=28 (or up to 92)
 * - Forecast: forecast_days=4 (for +1, +2, +3 days), model_version='cams-open-meteo'
 */

export type CamsDailyPoint = {
  date: string
  pm25: number | null
  validHours: number
  isForecast: boolean
  dataType: 'estimated' | 'forecast'
  modelVersion?: string | null
}

export type CamsAirQualityResult = {
  status: 'ok' | 'stale' | 'unsupported' | 'error'
  historical: CamsDailyPoint[]
  forecast: CamsDailyPoint[]
  updatedAt: string
  historicalLabel: string
  forecastLabel: string
  accuracyText: string
  accuracyWarning: string
  errorMessage?: string
}

const PUBLIC_API_HOST = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const CUSTOMER_API_HOST = 'https://customer-air-quality-api.open-meteo.com/v1/air-quality'

export function getOpenMeteoKey(): string | null {
  const key = process.env.OPEN_METEO_API_KEY || process.env.OPENMETEO_API_KEY
  if (!key || !key.trim()) return null
  return key.trim()
}

export function getOpenMeteoHost(): { url: string; hasKey: boolean } {
  const key = getOpenMeteoKey()
  if (key) {
    return { url: `${CUSTOMER_API_HOST}?apikey=${encodeURIComponent(key)}`, hasKey: true }
  }
  return { url: PUBLIC_API_HOST, hasKey: false }
}

export const CAMS_HISTORICAL_LABEL = 'ค่าประมาณจากแบบจำลอง CAMS ~45 กม. ไม่ใช่ค่าที่วัดจริง'
export const CAMS_FORECAST_LABEL = 'พยากรณ์โดยแบบจำลองระดับโลก CAMS (Copernicus) ผ่าน Open-Meteo ความละเอียด ~45 กม. ไม่ใช่ค่าวัด ณ จุดของคุณ (Data: Copernicus Atmosphere Monitoring Service via Open-Meteo)'
export const CAMS_ACCURACY_TEXT = 'CAMS accuracy sample: กรุงเทพฯ 1–7 ต.ค., n=21, MAE 6.73 µg/m³, RMSE 8.03 µg/m³, Bias +2.23 µg/m³'

export const CAMS_ACCURACY_TEXT_PRODUCTION = 'CAMS accuracy sample: กรุงเทพฯ 1–7 ต.ค., n=21, MAE 6.73 µg/m³, RMSE 8.03 µg/m³, Bias +2.23 µg/m³'
export const CAMS_ACCURACY_WARNING = 'ตัวเลขนี้เป็นการประเมินจาก 3 สถานีในกรุงเทพฯ ช่วง 1–7 ต.ค. ไม่ใช่ความแม่นยำของทุกจังหวัดหรือทุกฤดู'

export async function fetchCamsAirQuality(
  latitude: number,
  longitude: number,
  pastDays = 28,
  forecastDays = 4,
  timeoutMs = 10000,
): Promise<CamsAirQualityResult> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      status: 'unsupported',
      historical: [],
      forecast: [],
      updatedAt: new Date().toISOString(),
      historicalLabel: CAMS_HISTORICAL_LABEL,
      forecastLabel: CAMS_FORECAST_LABEL,
      accuracyText: CAMS_ACCURACY_TEXT,
      accuracyWarning: CAMS_ACCURACY_WARNING,
      errorMessage: 'พิกัดไม่ถูกต้อง',
    }
  }

  const { url: baseUrl, hasKey } = getOpenMeteoHost()
  const url = new URL(baseUrl)
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('hourly', 'pm2_5')
  url.searchParams.set('past_days', String(Math.min(92, Math.max(1, pastDays))))
  url.searchParams.set('forecast_days', String(Math.min(7, Math.max(1, forecastDays))))
  url.searchParams.set('timezone', 'Asia/Bangkok')

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })

    if (res.status === 401 || res.status === 403) {
      return {
        status: 'error',
        historical: [],
        forecast: [],
        updatedAt: new Date().toISOString(),
        historicalLabel: CAMS_HISTORICAL_LABEL,
        forecastLabel: CAMS_FORECAST_LABEL,
        accuracyText: CAMS_ACCURACY_TEXT,
        accuracyWarning: CAMS_ACCURACY_WARNING,
        errorMessage: 'OPEN_METEO_AUTH_FAILED: การยืนยันตัวตนกับ Open-Meteo ไม่ถูกต้อง',
      }
    }

    if (!res.ok) {
      return {
        status: 'error',
        historical: [],
        forecast: [],
        updatedAt: new Date().toISOString(),
        historicalLabel: CAMS_HISTORICAL_LABEL,
        forecastLabel: CAMS_FORECAST_LABEL,
        accuracyText: CAMS_ACCURACY_TEXT,
        accuracyWarning: CAMS_ACCURACY_WARNING,
        errorMessage: `OPEN_METEO_HTTP_ERROR_${res.status}: ไม่สามารถดึงข้อมูลจาก Open-Meteo ได้`,
      }
    }

    const payload = (await res.json()) as {
      hourly?: {
        time?: string[]
        pm2_5?: Array<number | null>
      }
    }

    const times = payload.hourly?.time ?? []
    const values = payload.hourly?.pm2_5 ?? []

    const dateMap = new Map<string, number[]>()
    for (let i = 0; i < Math.min(times.length, values.length); i++) {
      const date = times[i]?.slice(0, 10)
      const val = values[i]
      if (!date) continue
      if (!dateMap.has(date)) dateMap.set(date, [])
      if (val !== null && val !== undefined && Number.isFinite(val) && val >= 0) {
        dateMap.get(date)!.push(val)
      }
    }

    const todayStr = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const historical: CamsDailyPoint[] = []
    const forecast: CamsDailyPoint[] = []

    for (const [date, samples] of dateMap.entries()) {
      const validHours = samples.length
      // Threshold rule: >= 18 valid hours out of 24 required. Otherwise null.
      const pm25 = validHours >= 18 ? Math.round((samples.reduce((a, b) => a + b, 0) / validHours) * 10) / 10 : null
      const isForecast = date > todayStr

      const point: CamsDailyPoint = {
        date,
        pm25,
        validHours,
        isForecast,
        dataType: isForecast ? 'forecast' : 'estimated',
        modelVersion: isForecast ? 'cams-open-meteo' : null,
      }

      if (isForecast) {
        forecast.push(point)
      } else {
        historical.push(point)
      }
    }

    historical.sort((a, b) => a.date.localeCompare(b.date))
    forecast.sort((a, b) => a.date.localeCompare(b.date))

    // Open-Meteo includes the current day in past_days. Keep the API contract
    // explicit: callers receive exactly the requested number of historical days.
    const historyLimit = Math.min(92, Math.max(1, pastDays))
    if (historical.length > historyLimit) {
      historical.splice(0, historical.length - historyLimit)
    }

    return {
      status: historical.length || forecast.length ? 'ok' : 'stale',
      historical,
      forecast,
      updatedAt: new Date().toISOString(),
      historicalLabel: CAMS_HISTORICAL_LABEL,
      forecastLabel: CAMS_FORECAST_LABEL,
      accuracyText: CAMS_ACCURACY_TEXT,
      accuracyWarning: CAMS_ACCURACY_WARNING,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
    return {
      status: 'error',
      historical: [],
      forecast: [],
      updatedAt: new Date().toISOString(),
      historicalLabel: CAMS_HISTORICAL_LABEL,
      forecastLabel: CAMS_FORECAST_LABEL,
      accuracyText: CAMS_ACCURACY_TEXT,
      accuracyWarning: CAMS_ACCURACY_WARNING,
      errorMessage: isTimeout ? 'OPEN_METEO_TIMEOUT: การเชื่อมต่อ Open-Meteo หมดเวลา' : 'OPEN_METEO_FETCH_FAILED: เกิดข้อผิดพลาดในการดึงข้อมูล',
    }
  }
}
