import { NextRequest, NextResponse } from 'next/server'
import { getOpenAQDailyHistory } from '@/lib/openAqClient'
import { getDailyHistory, saveDailyAirQuality, type DailyAirQualityRecord } from '@/lib/airQualityRepository'
import { buildForecast } from '@/lib/airQualityForecast'
import { calculateTrend, generateAlertMessage } from '@/lib/pm25Trend'
import { shiftDate } from '@/scripts/airQualityIngestShared'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function bangkokDate(daysOffset = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + daysOffset))
    .toISOString().slice(0, 10)
}

function responseData(rows: DailyAirQualityRecord[]) {
  return rows.map((row) => ({
    ...row,
    unit: 'µg/m³',
    status: 'ข้อมูลจริง',
    advice: 'ติดตามค่าฝุ่นอย่างสม่ำเสมอ',
    isForecast: false,
    dataSource: 'OpenAQ',
  }))
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const stationId = params.get('station_id')?.trim() || ''
  const rawDays = params.get('days')
  const parsedDays = rawDays === null ? 30 : Number(rawDays)
  if (!/^\d+$/.test(stationId)) {
    return NextResponse.json({ success: false, error: 'STATION_ID_REQUIRED', message: 'กรุณาระบุ station_id ที่เป็นรหัสตัวเลข' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!Number.isInteger(parsedDays) || parsedDays < 1) {
    return NextResponse.json({ success: false, error: 'INVALID_DAYS', message: 'days ต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 365' }, { status: 400, headers: CORS_HEADERS })
  }
  const days = Math.min(parsedDays, 365)

  try {
    let rows = await getDailyHistory(stationId, days)
    let source: 'database' | 'openaq' = 'database'
    if (rows.length === 0) {
      source = 'openaq'
      const toDate = bangkokDate(-1)
      const fromDate = shiftDate(toDate, -(days - 1))
      const points = await getOpenAQDailyHistory(Number(stationId), fromDate, toDate)
      // This endpoint only knows the sensor ID, so unknown station metadata remains NULL.
      for (const point of points) {
        await saveDailyAirQuality({
          station_id: stationId,
          station_name: null,
          latitude: null,
          longitude: null,
          date: point.date,
          pm25: point.pm25,
          pm10: null,
          temperature: null,
          humidity: null,
          pressure: null,
          wind_speed: null,
          wind_direction: null,
          rainfall: null,
        })
      }
      rows = await getDailyHistory(stationId, days)
    }

    const historical = [...rows].reverse()
    const data = responseData(rows)
    const trendPoints = historical.flatMap((row) => row.pm25 === null ? [] : [{ date: row.date, pm25: row.pm25 }])
    const trend = calculateTrend(trendPoints)
    const forecast = buildForecast(trendPoints, 3)
    const risk = params.get('risk') === 'sensitive' ? 'sensitive' : 'general'
    const alertMessage = generateAlertMessage(trend, { audience: risk })
    const historicalResponse = responseData(historical).map((row) => ({
      ...row,
      average: row.pm25,
      min: null,
      max: null,
    }))
    return NextResponse.json({
      success: true,
      data,
      source,
      history: historicalResponse,
      historical: historicalResponse,
      forecast,
      trend,
      alertMessage,
      state: historicalResponse.length ? 'success' : 'empty',
    }, { headers: CORS_HEADERS })
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_:.-]+$/.test(error.message)
      ? error.message.split(':')[0]
      : 'AIR_QUALITY_HISTORY_FAILED'
    console.error('[pm25-history] request failed', { code })
    return NextResponse.json({
      success: false,
      error: code,
      message: code.startsWith('OPENAQ_') ? 'ไม่สามารถดึงข้อมูลจาก OpenAQ ได้' : 'ไม่สามารถอ่านหรือบันทึกข้อมูลคุณภาพอากาศได้',
    }, { status: code.startsWith('OPENAQ_') ? 502 : 500, headers: CORS_HEADERS })
  }
}
