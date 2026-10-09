type HourlyAirQualityResponse = {
  hourly?: {
    time?: string[]
    pm2_5?: Array<number | null>
  }
}

export type GriddedPm25Point = { date: string; pm25: number }

const AIR_QUALITY_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const DAY_MS = 24 * 60 * 60 * 1000
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

function dateOffset(date: string, offset: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10)
}

function bangkokToday() {
  return new Date(Date.now() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Gets model-grid PM2.5 values when no ground-monitor history is available.
 * Values are hourly model output averaged by Bangkok calendar day, not station observations.
 */
export async function getGriddedPm25(
  latitude: number,
  longitude: number,
  fromDate: string,
  toDate: string,
  forecastDays = 3,
): Promise<{ historical: GriddedPm25Point[]; forecast: GriddedPm25Point[] }> {
  const today = bangkokToday()
  const start = Date.parse(`${fromDate}T00:00:00Z`)
  const todayStart = Date.parse(`${today}T00:00:00Z`)
  const pastDays = Math.min(92, Math.max(1, Math.ceil((todayStart - start) / DAY_MS)))
  const url = new URL(AIR_QUALITY_ENDPOINT)
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('hourly', 'pm2_5')
  url.searchParams.set('past_days', String(pastDays))
  // Provider's forecast_days includes today; request one extra day to return the requested
  // number of complete dates after today.
  url.searchParams.set('forecast_days', String(Math.min(7, Math.max(0, forecastDays + 1))))
  url.searchParams.set('timezone', 'Asia/Bangkok')

  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`Gridded air-quality request failed (${response.status})`)
  const payload = await response.json() as HourlyAirQualityResponse
  const times = payload.hourly?.time ?? []
  const values = payload.hourly?.pm2_5 ?? []
  const grouped = new Map<string, number[]>()

  for (let index = 0; index < Math.min(times.length, values.length); index += 1) {
    const date = times[index]?.slice(0, 10)
    const value = Number(values[index])
    if (!date || !Number.isFinite(value) || value < 0) continue
    const bucket = grouped.get(date) ?? []
    bucket.push(value)
    grouped.set(date, bucket)
  }

  const points = [...grouped.entries()]
    .map(([date, samples]) => ({
      date,
      pm25: Math.round((samples.reduce((sum, value) => sum + value, 0) / samples.length) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    historical: points.filter((point) => point.date >= fromDate && point.date <= toDate && point.date <= today),
    forecast: points.filter((point) => point.date > today && point.date <= dateOffset(today, forecastDays)),
  }
}
