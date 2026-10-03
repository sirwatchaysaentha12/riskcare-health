import { NextRequest, NextResponse } from 'next/server'
import { findOpenAQStations, getOpenAQDailyHistory, type OpenAQStation } from '@/lib/openAqClient'
import { OpenAQConfigurationError, UpstreamRequestError } from '@/lib/openAqErrors'
import { buildForecast } from '@/lib/airQualityForecast'
import { getVertexForecasts, BASELINE_MODEL_VERSION } from '@/lib/airQualityVertexForecast'
import { pm25Status } from '@/lib/pm25Status'
import { pm25ToAqi } from '@/lib/aqiStatus'

const CORS_HEADERS = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
// ข้อมูลรายวันเปลี่ยนตามเวลา — ห้ามเบราว์เซอร์ cache (ไม่งั้นสลับ PM2.5/AQI อาจได้ค่าเก่า)
const RESPONSE_HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'no-store' }

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: RESPONSE_HEADERS }) }

const isValidLatLng = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180

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
    // ตาราง pm25_forecast_daily ใช้ station_id = sensor ID (เดียวกับ air_quality_daily.station_id)
    const vertexFetched = await getVertexForecasts(String(station.sensorId), 3)
    // กันชน: ตัดผล ML ที่ซ้อนกับวันที่มีข้อมูลจริงแล้ว (ผลจากข้อมูลล้าหลัง) —
    // วันที่ ≤ observed ต้องแสดง "ข้อมูลจริง" ไม่ใช่ "คาดการณ์"; เหลือ 0 วัน → fallback baseline
    const observedLastDate = historical.length ? historical[historical.length - 1].date : null
    const vertexFreshPoints = vertexFetched?.points.filter((p) => !observedLastDate || p.date > observedLastDate) ?? []
    const vertex = vertexFreshPoints.length ? { points: vertexFreshPoints, complete: vertexFreshPoints.length >= 3 } : null
    let forecast: Array<Record<string, unknown>>
    let modelVersion: string
    let dataSourceLabel: string
    if (vertex) {
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
    }

    // "วันนี้" — ใช้ข้อมูลจริงก่อน; ถ้าสถานียังไม่ส่งข้อมูลวันนี้ ให้ประมาณการด้วยสูตรเดียวกับ
    // baseline (0.7×ค่าล่าสุด + 0.3×MA7) และติด dataType: 'estimated' (ป้าย "ประมาณการ")
    // ห้ามปลอมเป็นค่าที่วัดจริง
    const hasTodayObserved = historical.some((row) => row.date === bangkokToday)
    let todayEstimate: Record<string, unknown> | null = null
    if (!hasTodayObserved && history.length >= 3) {
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
      forecastNote: dataSourceLabel === 'Vertex AI'
        ? 'คาดการณ์โดยโมเดล Vertex AI — ไม่ใช่ค่าที่วัดจริง'
        : dataSourceLabel === 'ML model (server)'
          ? 'คาดการณ์โดยโมเดลเรียนรู้ข้อมูลฝุ่นย้อนหลัง (ML) — ไม่ใช่ค่าที่วัดจริง'
          : 'คาดการณ์จากแนวโน้มย้อนหลัง — ไม่ใช่ข้อมูลจริง',
      modelVersion,
      dataSource: 'OpenAQ',
      observedThrough,
      forecastThrough,
      updatedAt: new Date().toISOString(),
      state: historical.length ? (forecast.length ? 'success' : 'partial') : 'empty',
    }, { headers: RESPONSE_HEADERS })
  } catch (error) {
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
