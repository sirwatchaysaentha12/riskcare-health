import { NextRequest, NextResponse } from 'next/server'
import { findOpenAQStations, getOpenAQDailyHistory, type OpenAQStation } from '@/lib/openAqClient'
import { OpenAQConfigurationError, UpstreamRequestError } from '@/lib/openAqErrors'
import { buildForecast } from '@/lib/airQualityForecast'
import { getVertexForecasts, BASELINE_MODEL_VERSION } from '@/lib/airQualityVertexForecast'
import { getProvincePm25Forecast, PM25_FROZEN_MODEL_SUPPORTED_PROVINCES, PM25_FROZEN_MODEL_TRAINED_UNTIL, PM25_FROZEN_MODEL_VERSION } from '@/lib/provincePm25Forecast'
import { pm25Status } from '@/lib/pm25Status'
import { pm25ToAqi } from '@/lib/aqiStatus'
import { getGriddedPm25 } from '@/lib/griddedPm25'
import { ensureEnvChecked } from '@/lib/envCheck'

const GRIDDED_PM25_MODEL_VERSION = 'cams-gridded-global-v1'
const GRIDDED_FALLBACK_NOTE = 'จังหวัดนี้ไม่มีผลจากโมเดลที่ฝึกในโครงการ จึงใช้แบบจำลองพื้นที่ PM2.5 แทน ค่านี้เป็นค่าประมาณ ไม่ใช่ค่าตรวจวัดจากสถานี'

const CORS_HEADERS = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
// ข้อมูลรายวันเปลี่ยนตามเวลา — ห้ามเบราว์เซอร์ cache (ไม่งั้นสลับ PM2.5/AQI อาจได้ค่าเก่า)
const RESPONSE_HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'no-store' }

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: RESPONSE_HEADERS }) }

const isValidLatLng = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180

async function griddedFallbackResponse(lat: number, lon: number, fromDate: string, toDate: string, metric: 'AQI' | 'PM2.5', isSensitive: boolean) {
  const grid = await getGriddedPm25(lat, lon, fromDate, toDate, 3)
  if (grid.historical.length === 0 && grid.forecast.length === 0) return null
  const toMetric = (value: number) => metric === 'AQI' ? (pm25ToAqi(value) ?? Math.round(value)) : value
  const mapPoint = (point: { date: string; pm25: number }, isForecast: boolean) => {
    const status = pm25Status(point.pm25, isSensitive)
    return {
      date: point.date,
      value: toMetric(point.pm25),
      unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
      status: status?.status ?? 'รอข้อมูล',
      advice: status?.advice ?? '',
      isForecast,
      dataType: 'estimated',
      dataSource: 'gridded-estimate',
    }
  }
  const historical = grid.historical.map((point) => mapPoint(point, false))
  const forecast = grid.forecast.map((point) => mapPoint(point, true))
  return NextResponse.json({
    station: null,
    metric,
    unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
    historical,
    forecast,
    days: historical,
    todayEstimate: null,
    forecastNote: 'ค่าฝุ่นจากแบบจำลองพื้นที่ เป็นค่าประมาณ ไม่ใช่ค่าตรวจวัดจากสถานี',
    dataNotice: 'กำลังแสดงค่าประมาณจากแบบจำลองพื้นที่ เนื่องจากไม่มีค่าตรวจวัดในช่วงที่เลือก',
    modelVersion: null,
    dataSource: 'gridded-estimate',
    observedThrough: historical.at(-1)?.date ?? null,
    forecastThrough: forecast.at(-1)?.date ?? null,
    updatedAt: new Date().toISOString(),
    state: 'success',
  }, { headers: RESPONSE_HEADERS })
}

async function getGriddedProvinceForecast(lat: number, lon: number, fromDate: string, toDate: string) {
  try {
    return (await getGriddedPm25(lat, lon, fromDate, toDate, 3)).forecast
  } catch {
    // A failed area-model request must not turn real station history into an API error.
    return []
  }
}

function mapGriddedForecast(points: Array<{ date: string; pm25: number }>, metric: 'AQI' | 'PM2.5', isSensitive: boolean, updatedAt: string) {
  return points.map((point, index) => {
    const status = pm25Status(point.pm25, isSensitive)
    return {
      date: point.date,
      value: metric === 'AQI' ? (pm25ToAqi(point.pm25) ?? Math.round(point.pm25)) : point.pm25,
      unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
      status: status?.status ?? 'รอข้อมูล',
      advice: status?.advice ?? '',
      isForecast: true,
      dataType: 'estimated',
      dataSource: 'gridded-estimate',
      horizon: index + 1,
      modelVersion: GRIDDED_PM25_MODEL_VERSION,
      updatedAt,
    }
  })
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const periodValue = params.get('period') || 'currentWeek'
  // นิยาม: ทุกปุ่ม = หน้าต่าง 7 วันเลื่อนช่วง (ไม่ใช่สะสม) — [วันเริ่ม, วันสุดท้าย] หน่วย "วันก่อนวันนี้"
  // สัปดาห์นี้ = 6-0 วันก่อน | สัปดาห์ที่แล้ว = 13-7 | 2 สัปดาห์ = 20-14 | 3 = 27-21 | 4 = 34-28
  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
  const bangkokDate = (daysBack: number) => new Date(Date.now() + BANGKOK_OFFSET_MS - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const periodWindows: Record<string, [number, number]> = {
    currentWeek: [6, 0], previousWeek: [13, 7], twoWeeksAgo: [20, 14], threeWeeksAgo: [27, 21], fourWeeksAgo: [34, 28],
  }
  const metric = params.get('metric') === 'AQI' ? 'AQI' : 'PM2.5'
  // กลุ่มสุขภาพผู้ใช้ (จาก frontend getPersonalizedAudience) → คำแนะนำเฉพาะบุคคล
  const isSensitive = params.get('risk') === 'sensitive'
  const useFrozenProvinceModel = params.get('forecastModel') === 'v27'
  const requestedProvince = params.get('province')?.trim() || ''
  const latRaw = params.get('lat')
  const lonRaw = params.get('lon')
  // พิกัดจำเป็น — Number(null) เป็น 0 ได้ จึงต้องแยกกรณีค่าหายก่อนแปลง
  const lat = latRaw === null || latRaw.trim() === '' ? NaN : Number(latRaw)
  const lon = lonRaw === null || lonRaw.trim() === '' ? NaN : Number(lonRaw)

  const selectedWindow = periodWindows[periodValue]
  let fromDate: string
  let toDate: string
  if (selectedWindow) {
    fromDate = bangkokDate(selectedWindow[0])
    toDate = bangkokDate(selectedWindow[1])
  } else {
    // numeric period (จำนวนวันย้อนหลังจบที่วันนี้) สำหรับ caller ที่ส่งตัวเลขมา
    const days = Math.min(Math.max(Number(periodValue) || 7, 3), 90)
    fromDate = bangkokDate(days - 1)
    toDate = bangkokDate(0)
  }

  // ตรวจ env ตอนเริ่ม (ไม่พิมพ์ค่า — แค่บันทึก present/missing)
  ensureEnvChecked()

  // พิกัดจำเป็น — ไม่มี fallback ไปกรุงเทพฯ แบบเงียบ ๆ (แผนเฟส 2)
  if (!isValidLatLng(lat, lon)) {
    return NextResponse.json({
      station: null, metric, unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
      historical: [], forecast: [], updatedAt: null, dataSource: 'OpenAQ', state: 'invalid_coordinates',
      error: 'INVALID_COORDINATES', message: 'กรุณาระบุพิกัด lat/lon ที่ถูกต้อง',
    }, { status: 400, headers: RESPONSE_HEADERS })
  }

  try {
    // เฟส 2: ค้นหาสถานี PM2.5 ใกล้สุดจากพิกัดก่อนเสมอ (ไม่มีสถานี → รายงานสถานะตรง ๆ)
    const stations = await findOpenAQStations(lat, lon)
    if (!stations.length) {
      if (useFrozenProvinceModel) {
        const result = requestedProvince
          ? await getProvincePm25Forecast(requestedProvince, PM25_FROZEN_MODEL_VERSION)
          : null
        let forecast: Array<Record<string, unknown>> = (result?.points ?? []).map((point) => {
          const status = pm25Status(point.value, isSensitive)
          return {
            date: point.date,
            value: metric === 'AQI' ? (pm25ToAqi(point.value) ?? Math.round(point.value)) : point.value,
            unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
            status: status?.status ?? 'รอข้อมูล',
            advice: status?.advice ?? '',
            isForecast: true,
            dataType: 'forecast',
            horizon: point.horizon,
            modelVersion: point.modelVersion,
            updatedAt: point.updatedAt,
            stationCount: point.stationCount,
          }
        })
        if (!forecast.length) {
          const griddedPoints = await getGriddedProvinceForecast(lat, lon, fromDate, toDate)
          if (griddedPoints.length) {
            const updatedAt = new Date().toISOString()
            forecast = mapGriddedForecast(griddedPoints, metric, isSensitive, updatedAt)
            return NextResponse.json({
              station: null,
              metric,
              unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
              historical: [],
              forecast,
              days: [],
              todayEstimate: null,
              forecastNote: GRIDDED_FALLBACK_NOTE,
              forecastUpdatedAt: updatedAt,
              forecastStale: false,
              forecastStationCount: 0,
              forecastModelTrainedUntil: null,
              provinceForecast: requestedProvince || null,
              modelVersion: GRIDDED_PM25_MODEL_VERSION,
              dataSource: 'gridded-estimate',
              updatedAt,
              state: 'partial',
            }, { headers: RESPONSE_HEADERS })
          }
        }
        return NextResponse.json({
          station: null,
          metric,
          unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
          historical: [],
          forecast,
          days: [],
          todayEstimate: null,
          forecastNote: result && !result.schemaReady
            ? 'ยังไม่ได้ติดตั้งโครงสร้างตารางพยากรณ์ กรุณารันไฟล์ SQL migration ก่อน'
            : result?.stale
              ? 'ข้อมูลพยากรณ์ล้าสมัย — ไม่มีผลใหม่ในช่วง 2 วันที่ผ่านมา'
              : requestedProvince
                ? 'พยากรณ์โดยโมเดล ข้อมูลฝึกถึง 30 ก.ย. 2569'
                : 'การพยากรณ์ชุดนี้ใช้จังหวัดในโปรไฟล์ — เลือกจังหวัดเพื่อดูผล',
          forecastUpdatedAt: result?.updatedAt ?? null,
          forecastStale: result?.stale ?? false,
          forecastStationCount: result?.stationCount ?? 0,
          forecastModelTrainedUntil: PM25_FROZEN_MODEL_TRAINED_UNTIL,
          provinceForecast: requestedProvince || null,
          modelVersion: PM25_FROZEN_MODEL_VERSION,
          dataSource: 'OpenAQ',
          updatedAt: new Date().toISOString(),
          state: forecast.length ? 'partial' : 'empty',
          message: forecast.length ? undefined : 'ยังไม่มีข้อมูลพยากรณ์สำหรับจังหวัดนี้',
        }, { headers: RESPONSE_HEADERS })
      }
      const fallback = await griddedFallbackResponse(lat, lon, fromDate, toDate, metric, isSensitive)
      if (fallback) return fallback
      return NextResponse.json({
        station: null, metric, unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
        historical: [], forecast: [], updatedAt: new Date().toISOString(), dataSource: 'OpenAQ', state: 'no_station_nearby',
        message: 'ไม่พบสถานีวัดฝุ่น PM2.5 ในรัศมี 25 กม. จากพิกัดของคุณ',
      }, { headers: RESPONSE_HEADERS })
    }

    // เฟส 3: ดึงค่าเฉลี่ยรายวันตามลำดับความชอบของสถานี (Air4Thai ใกล้สุดก่อน)
    // ข้ามสถานีที่ daily endpoint พังฝั่ง upstream (5xx) หรือไม่มีข้อมูลในช่วงที่ขอ — ยังใช้ข้อมูลจริงทั้งหมด
    let station: OpenAQStation | null = null
    let history: { date: string; pm25: number }[] = []
    let lastUpstreamError: UpstreamRequestError | null = null
    let sawUpstreamSuccess = false
    for (const candidate of stations) {
      try {
        const daily = await getOpenAQDailyHistory(candidate.sensorId, fromDate, toDate)
        sawUpstreamSuccess = true
        if (!daily.length) continue
        station = candidate
        history = daily
        break
      } catch (error) {
        if (error instanceof UpstreamRequestError && error.upstreamStatus >= 500) { lastUpstreamError = error; continue }
        throw error
      }
    }
    if (history.length === 0) {
      const fallback = await griddedFallbackResponse(lat, lon, fromDate, toDate, metric, isSensitive)
      if (fallback) return fallback
    }
    if (!station) {
      // throw error เดิมเฉพาะเมื่อไม่มีสถานีใด fetch สำเร็จเลย ส่วน "fetch สำเร็จแต่ว่าง" รายงาน empty ตรง ๆ
      if (!sawUpstreamSuccess && lastUpstreamError) throw lastUpstreamError
      station = stations[0]
    }
    if (!station) throw new Error('AIR_QUALITY_PROCESSING_FAILED')
    const toMetric = (value: number) => metric === 'AQI' ? (pm25ToAqi(value) ?? Math.round(value)) : Math.round(value * 10) / 10
    const historical = history.map((point) => {
      const status = pm25Status(point.pm25, isSensitive)
      return {
        date: point.date,
        value: toMetric(point.pm25),
        unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
        status: status?.status ?? 'รอข้อมูล',
        advice: status?.advice ?? '',
        isForecast: false,
        dataSource: 'OpenAQ',
      }
    })

    // เฟส 4 (Vertex AI): ลำดับความชอบ — ผล batch prediction จาก Vertex AI ในตาราง pm25_forecast_daily
    // (backend ตรวจ schema แล้วเท่านั้น) → ถ้าไม่มี ใช้ baseline MA3+trend จากข้อมูลจริงของสถานีเดิม
    // ทุกแถวพยากรณ์มี dataType/horizon/modelVersion/updatedAt เพื่อย้อนตรวจได้
    const bangkokToday = bangkokDate(0)
    const provinceForecast = useFrozenProvinceModel && requestedProvince
      ? await getProvincePm25Forecast(requestedProvince, PM25_FROZEN_MODEL_VERSION)
      : null
    const griddedProvinceForecast = useFrozenProvinceModel && !provinceForecast?.points.length
      ? await getGriddedProvinceForecast(lat, lon, fromDate, toDate)
      : []
    // Legacy callers retain their existing Vertex/baseline behavior. The profile-province
    // forecast path is strict: it reads only frozen-model rows and never falls back to baseline.
    const vertexFetched = useFrozenProvinceModel ? null : await getVertexForecasts(String(station.sensorId), 3)
    const observedLastDate = historical.length ? historical[historical.length - 1].date : null
    const vertexFreshPoints = vertexFetched?.points.filter((p) => !observedLastDate || p.date > observedLastDate) ?? []
    const vertex = vertexFreshPoints.length ? { points: vertexFreshPoints, complete: vertexFreshPoints.length >= 3 } : null
    let forecast: Array<Record<string, unknown>>
    let modelVersion: string
    let dataSourceLabel: string
    let forecastUpdatedAt: string | null = null
    let forecastStale = false
    let forecastStationCount = 0
    let forecastNote: string
    if (useFrozenProvinceModel) {
      modelVersion = PM25_FROZEN_MODEL_VERSION
      dataSourceLabel = 'ML model (server)'
      forecastUpdatedAt = provinceForecast?.updatedAt ?? null
      forecastStale = provinceForecast?.stale ?? false
      forecastStationCount = provinceForecast?.stationCount ?? 0
      forecast = (provinceForecast?.points ?? []).map((point) => {
        const status = pm25Status(point.value, isSensitive)
        return {
          date: point.date,
          value: toMetric(point.value),
          unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
          status: status?.status ?? 'รอข้อมูล',
          advice: status?.advice ?? '',
          isForecast: true,
          dataSource: dataSourceLabel,
          dataType: 'forecast',
          horizon: point.horizon,
          modelVersion: point.modelVersion,
          updatedAt: point.updatedAt,
          stationCount: point.stationCount,
        }
      })
      forecastNote = provinceForecast && !provinceForecast.schemaReady
        ? 'ยังไม่ได้ติดตั้งโครงสร้างตารางพยากรณ์ กรุณารันไฟล์ SQL migration ก่อน'
        : !requestedProvince
          ? 'การพยากรณ์ชุดนี้ใช้จังหวัดในโปรไฟล์ — เลือกจังหวัดเพื่อดูผล'
        : provinceForecast?.stale
          ? 'ข้อมูลพยากรณ์ล้าสมัย — ไม่มีผลใหม่ในช่วง 2 วันที่ผ่านมา'
          : !PM25_FROZEN_MODEL_SUPPORTED_PROVINCES.includes(requestedProvince as typeof PM25_FROZEN_MODEL_SUPPORTED_PROVINCES[number])
            ? `โมเดลรุ่นนี้รองรับสถานีใน${PM25_FROZEN_MODEL_SUPPORTED_PROVINCES.join(' และ ')}เท่านั้น จึงยังไม่มีผลพยากรณ์สำหรับจังหวัด${requestedProvince}`
          : !provinceForecast?.points.length
            ? 'ยังไม่มีข้อมูลพยากรณ์สำหรับจังหวัดนี้ — ไม่มีสถานีที่รองรับส่งค่าของวันล่าสุด'
            : 'พยากรณ์โดยโมเดล ข้อมูลฝึกถึง 30 ก.ย. 2569'
      if (!forecast.length && griddedProvinceForecast.length) {
        const updatedAt = new Date().toISOString()
        modelVersion = GRIDDED_PM25_MODEL_VERSION
        dataSourceLabel = 'CAMS gridded model'
        forecast = mapGriddedForecast(griddedProvinceForecast, metric, isSensitive, updatedAt)
        forecastUpdatedAt = updatedAt
        forecastStale = false
        forecastStationCount = 0
        forecastNote = GRIDDED_FALLBACK_NOTE
      }
    } else if (vertex) {
      modelVersion = vertex.points[0]?.modelVersion ?? 'vertex-unknown'
      // label ตามความจริงของแหล่งโมเดล: vertex-* = Vertex AI, อื่น ๆ = โมเดล ML ฝั่งเซิร์ฟเวอร์
      const isVertex = modelVersion.toLowerCase().includes('vertex')
      dataSourceLabel = isVertex ? 'Vertex AI' : 'ML model (server)'
      forecast = vertex.points.map((point) => {
        const status = pm25Status(point.value, isSensitive)
        return {
          date: point.date,
          value: toMetric(point.value),
          unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
          status: status?.status ?? 'คาดการณ์',
          advice: status?.advice ?? 'ติดตามข้อมูลจริงเพิ่มเติม',
          isForecast: true,
          dataSource: dataSourceLabel,
          dataType: 'forecast',
          horizon: point.horizon,
          modelVersion: point.modelVersion,
          updatedAt: point.updatedAt,
          ...(point.min != null && point.max != null ? { min: toMetric(point.min), max: toMetric(point.max) } : {}),
        }
      })
      forecastUpdatedAt = vertex.points.map((point) => point.updatedAt).sort().at(-1) ?? null
      forecastStationCount = 1
      forecastNote = dataSourceLabel === 'Vertex AI'
        ? 'คาดการณ์โดยโมเดล Vertex AI — ไม่ใช่ค่าที่วัดจริง'
        : 'คาดการณ์โดยโมเดลเรียนรู้ข้อมูลฝุ่นย้อนหลัง (ML) — ไม่ใช่ค่าที่วัดจริง'
    } else {
      modelVersion = BASELINE_MODEL_VERSION
      dataSourceLabel = 'derived'
      forecast = buildForecast(history, 3, isSensitive).map((point) => ({
        date: point.date,
        value: toMetric(point.value),
        unit: metric === 'AQI' ? 'AQI' : point.unit,
        status: point.status,
        advice: point.advice,
        isForecast: true,
        dataSource: point.dataSource,
        dataType: 'forecast',
        horizon: 0,
        modelVersion,
        updatedAt: new Date().toISOString(),
      }))
      forecastUpdatedAt = forecast.length ? new Date().toISOString() : null
      forecastStationCount = forecast.length ? 1 : 0
      forecastNote = 'คาดการณ์จากแนวโน้มย้อนหลัง — ไม่ใช่ข้อมูลจริง'
    }

    // "วันนี้" — ใช้ข้อมูลจริงก่อน; ถ้าสถานียังไม่ส่งข้อมูลวันนี้ ให้ประมาณการด้วยสูตรเดียวกับ
    // baseline (0.7×ค่าล่าสุด + 0.3×MA7) และติด dataType: 'estimated' (ป้าย "ประมาณการ")
    // ห้ามปลอมเป็นค่าที่วัดจริง
    const hasTodayObserved = historical.some((row) => row.date === bangkokToday)
    let todayEstimate: Record<string, unknown> | null = null
    if (!useFrozenProvinceModel && !hasTodayObserved && history.length >= 3) {
      const last = history[history.length - 1].pm25
      const last7 = history.slice(-7).map((point) => point.pm25)
      const ma7 = last7.length === 7 ? last7.reduce((sum, value) => sum + value, 0) / 7 : last
      const estimated = Math.round((0.7 * last + 0.3 * ma7) * 10) / 10
      const status = pm25Status(estimated, isSensitive)
      todayEstimate = {
        date: bangkokToday,
        value: toMetric(estimated),
        unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
        status: status?.status ?? 'ประมาณการ',
        advice: status?.advice ?? 'รอข้อมูลวัดจริงของวันนี้',
        isForecast: true,
        dataSource: 'derived',
        dataType: 'estimated',
        horizon: 0,
        modelVersion,
        updatedAt: new Date().toISOString(),
      }
    }
    const forecastThrough = forecast.length ? forecast[forecast.length - 1].date : null
    const observedThrough = historical.length ? historical[historical.length - 1].date : null

    return NextResponse.json({
      station: {
        locationId: station.locationId,
        sensorId: station.sensorId,
        stationName: station.stationName,
        provider: station.provider,
        distanceKm: Math.round(station.distanceKm * 10) / 10,
        latitude: station.latitude,
        longitude: station.longitude,
      },
      location: station.locationId,
      metric,
      unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
      historical,
      forecast,
      days: historical,
      todayEstimate,
      forecastNote,
      forecastUpdatedAt,
      forecastStale,
      forecastStationCount,
      forecastModelTrainedUntil: modelVersion === PM25_FROZEN_MODEL_VERSION ? PM25_FROZEN_MODEL_TRAINED_UNTIL : null,
      provinceForecast: useFrozenProvinceModel ? requestedProvince || null : null,
      modelVersion,
      dataSource: 'OpenAQ',
      observedThrough,
      forecastThrough,
      updatedAt: new Date().toISOString(),
      state: historical.length ? (forecast.length ? 'success' : 'partial') : 'empty',
    }, { headers: RESPONSE_HEADERS })
  } catch (error) {
    try {
      const fallback = await griddedFallbackResponse(lat, lon, fromDate, toDate, metric, isSensitive)
      if (fallback) {
        console.warn('[Dashboard] using gridded fallback after station-source failure')
        return fallback
      }
    } catch (fallbackError) {
      console.error('[Dashboard] gridded fallback failed', fallbackError instanceof Error ? fallbackError.message : 'unknown error')
    }
    const upstreamStatus = error instanceof UpstreamRequestError ? error.upstreamStatus : undefined
    let errorCode = 'AIR_QUALITY_PROCESSING_FAILED'
    let message = 'ไม่สามารถประมวลผลข้อมูลคุณภาพอากาศได้'
    let responseStatus = 502
    if (error instanceof OpenAQConfigurationError) {
      errorCode = `OPENAQ_API_KEY_${error.configurationStatus.toUpperCase()}`
      message = error.configurationStatus === 'missing'
        ? 'ยังไม่ได้ตั้งค่า OpenAQ API Key ใน admin-app/.env.local'
        : error.configurationStatus === 'empty'
          ? 'ค่า OpenAQ API Key ว่าง'
          : 'รูปแบบ OpenAQ API Key ไม่ถูกต้อง'
      responseStatus = 500
    } else if (error instanceof UpstreamRequestError) {
      errorCode = error.upstreamStatus === 401
        ? 'OPENAQ_API_KEY_REJECTED'
        : error.upstreamStatus === 403
          ? 'OPENAQ_ACCESS_FORBIDDEN'
          : error.upstreamStatus === 404
            ? 'OPENAQ_RESOURCE_NOT_FOUND'
          : error.upstreamStatus === 429
            ? 'OPENAQ_RATE_LIMITED'
            : error.upstreamStatus >= 500
              ? 'OPENAQ_UPSTREAM_UNAVAILABLE'
              : 'OPENAQ_REQUEST_FAILED'
      message = error.upstreamStatus === 401
        ? 'OpenAQ ปฏิเสธข้อมูลยืนยันตัวตน โปรดตรวจสอบ API Key ในบัญชี OpenAQ'
        : error.upstreamStatus === 403
          ? 'บัญชีหรือสิทธิ์การเข้าถึง OpenAQ ถูกจำกัด'
          : error.upstreamStatus === 404
            ? 'ไม่พบ resource หรือ sensor ที่ร้องขอจาก OpenAQ'
          : error.upstreamStatus === 429
            ? 'OpenAQ จำกัดจำนวนคำขอชั่วคราว'
            : 'ไม่สามารถดึงข้อมูลจาก OpenAQ ได้'
    } else if (error instanceof Error && error.message === 'OPENAQ_INVALID_RESPONSE') {
      errorCode = 'OPENAQ_INVALID_RESPONSE'
      message = 'OpenAQ ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้'
    } else if (error instanceof Error && error.message.startsWith('OPENAQ_NETWORK_ERROR')) {
      errorCode = 'OPENAQ_NETWORK_ERROR'
      message = 'ไม่สามารถเชื่อมต่อ OpenAQ ได้'
    } else if (error instanceof Error && error.message === 'INVALID_COORDINATES') {
      errorCode = 'INVALID_COORDINATES'
      message = 'พิกัด lat/lon ไม่ถูกต้อง'
      responseStatus = 400
    }
    console.error('[Dashboard] request failed', { step: 'station-history-forecast', errorCode, upstreamStatus })
    return NextResponse.json({
      station: null, metric, unit: metric === 'AQI' ? 'AQI' : 'µg/m³',
      historical: [], forecast: [], updatedAt: null, dataSource: 'OpenAQ', state: 'error',
      error: errorCode,
      message,
      ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
    }, { status: responseStatus, headers: RESPONSE_HEADERS })
  }
}
