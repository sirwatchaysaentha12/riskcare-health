import { NextRequest, NextResponse } from 'next/server'
import { findOpenAQStations, getOpenAQRecentHourly } from '@/lib/openAqClient'
import { OpenAQConfigurationError, UpstreamRequestError } from '@/lib/openAqErrors'
import { pm25Status } from '@/lib/pm25Status'
import { buildHourlyPersistenceForecast, HOURLY_MEASURED_ACCURACY, HOURLY_MODEL_VERSION } from '@/lib/hourlyForecast'

const CORS_HEADERS = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
const RESPONSE_HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'no-store' }

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: RESPONSE_HEADERS }) }

const BANGKOK_TZ = 'Asia/Bangkok'
const localTime = (utcIso: string) => new Intl.DateTimeFormat('th-TH', { timeZone: BANGKOK_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(utcIso))

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const isSensitive = params.get('risk') === 'sensitive'
  const latRaw = params.get('lat')
  const lonRaw = params.get('lon')
  const lat = latRaw === null || latRaw.trim() === '' ? NaN : Number(latRaw)
  const lon = lonRaw === null || lonRaw.trim() === '' ? NaN : Number(lonRaw)

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({
      state: 'invalid_coordinates', error: 'INVALID_COORDINATES',
      message: 'กรุณาระบุพิกัด lat/lon ที่ถูกต้อง',
      modelVersion: HOURLY_MODEL_VERSION, observed: null, forecast: [], updatedAt: new Date().toISOString(),
    }, { status: 400, headers: RESPONSE_HEADERS })
  }

  try {
    // หาสถานีใกล้สุดที่ "มีข้อมูลรายชั่วโมงจริง" — ลองตามลำดับความใกล้ (สถานีแรกอาจเป็น low-cost sensor ที่ไม่มี hourly rollup)
    const stations = await findOpenAQStations(lat, lon)
    if (!stations.length) {
      return NextResponse.json({
        state: 'no_station_nearby', error: 'NO_STATION_NEARBY',
        message: 'ไม่พบสถานีวัด PM2.5 ในรัศมี 25 กม.',
        modelVersion: HOURLY_MODEL_VERSION, station: null, observed: null, forecast: [],
        accuracy: HOURLY_MEASURED_ACCURACY, updatedAt: new Date().toISOString(),
      }, { status: 200, headers: RESPONSE_HEADERS })
    }
    let station: typeof stations[number] | null = null
    let series: Awaited<ReturnType<typeof getOpenAQRecentHourly>> = []
    for (const candidate of stations.slice(0, 5)) {
      const points = await getOpenAQRecentHourly(candidate.sensorId, 12)
      if (points.length) { station = candidate; series = points; break }
    }
    if (!station) {
      return NextResponse.json({
        state: 'no_data', error: 'NO_HOURLY_DATA',
        message: 'สถานีใกล้คุณทั้งหมดยังไม่มีข้อมูลรายชั่วโมง',
        modelVersion: HOURLY_MODEL_VERSION,
        station: { name: stations[0].stationName, sensorId: stations[0].sensorId, distanceKm: Math.round(stations[0].distanceKm * 10) / 10 },
        observed: null, forecast: [], accuracy: HOURLY_MEASURED_ACCURACY, updatedAt: new Date().toISOString(),
      }, { status: 200, headers: RESPONSE_HEADERS })
    }
    const built = buildHourlyPersistenceForecast(series, Date.now())
    if (!built || !built.observed) {
      return NextResponse.json({
        state: 'no_data', error: 'NO_HOURLY_DATA',
        message: 'สถานีใกล้สุดยังไม่มีข้อมูลรายชั่วโมง',
        modelVersion: HOURLY_MODEL_VERSION, station: { name: station.stationName, sensorId: station.sensorId, distanceKm: Math.round(station.distanceKm * 10) / 10 },
        observed: null, forecast: [], accuracy: HOURLY_MEASURED_ACCURACY, updatedAt: new Date().toISOString(),
      }, { status: 200, headers: RESPONSE_HEADERS })
    }
    const { observed } = built

    const observedStatus = pm25Status(observed.pm25, isSensitive)
    const forecast = built.forecast.map((point) => ({ ...point, status: pm25Status(point.pm25, isSensitive) }))

    return NextResponse.json({
      state: built.stale ? 'partial' : 'success',
      modelVersion: HOURLY_MODEL_VERSION,
      station: { name: station.stationName, sensorId: station.sensorId, distanceKm: Math.round(station.distanceKm * 10) / 10 },
      observed: { ...observed, timeLocal: localTime(observed.timeUtc), status: observedStatus, dataType: 'observed' },
      forecast,
      stale: built.stale,
      accuracy: HOURLY_MEASURED_ACCURACY,
      note: built.stale
        ? 'ค่าวัดล่าสุดเก่ากว่า 3 ชม. — ผลพยากรณ์อาจคลาดเคลื่อน รอข้อมูลใหม่ก่อนใช้ตัดสินใจ'
        : 'พยากรณ์รายชั่วโมงด้วยโมเดล persistence ที่ผ่านการวัดจริง ±2 และ ±3 เกิน 87-90% ทุกฤดู (ดู accuracy)',
      updatedAt: new Date().toISOString(),
    }, { headers: RESPONSE_HEADERS })
  } catch (error) {
    if (error instanceof OpenAQConfigurationError) {
      return NextResponse.json({ state: 'error', error: 'OPENAQ_CONFIGURATION', message: 'ยังไม่ได้ตั้งค่า OpenAQ API key', modelVersion: HOURLY_MODEL_VERSION, updatedAt: new Date().toISOString() }, { status: 500, headers: RESPONSE_HEADERS })
    }
    if (error instanceof UpstreamRequestError) {
      return NextResponse.json({ state: 'error', error: 'UPSTREAM_UNAVAILABLE', upstreamStatus: error.upstreamStatus, message: 'บริการข้อมูลขาขึ้นไม่พร้อมใช้งาน ลองใหม่อีกครั้ง', modelVersion: HOURLY_MODEL_VERSION, updatedAt: new Date().toISOString() }, { status: 502, headers: RESPONSE_HEADERS })
    }
    console.error('[hourly-forecast] unexpected error', error instanceof Error ? error.name : error)
    return NextResponse.json({ state: 'error', error: 'HOURLY_FORECAST_FAILED', message: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', modelVersion: HOURLY_MODEL_VERSION, updatedAt: new Date().toISOString() }, { status: 500, headers: RESPONSE_HEADERS })
  }
}
