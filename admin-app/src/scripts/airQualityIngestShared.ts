import type { OpenAQStation, Pm25HistoryPoint } from '@/lib/openAqClient'
import type { DailyAirQualityRecord } from '@/lib/airQualityRepository'

export function getBangkokDate(daysOffset = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + daysOffset))
    .toISOString().slice(0, 10)
}

export function shiftDate(date: string, daysOffset: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + daysOffset)).toISOString().slice(0, 10)
}

export function mapOpenAQPoint(
  station: OpenAQStation,
  point: Pm25HistoryPoint,
): DailyAirQualityRecord {
  return {
    station_id: String(station.sensorId),
    station_name: station.stationName,
    latitude: station.latitude,
    longitude: station.longitude,
    date: point.date,
    pm25: point.pm25,
    pm10: null,
    temperature: null,
    humidity: null,
    pressure: null,
    wind_speed: null,
    wind_direction: null,
    rainfall: null,
  }
}

export function parseIngestOptions(args: string[]) {
  const flags = new Map(args.filter((arg) => arg.startsWith('--')).map((arg) => {
    const separator = arg.indexOf('=')
    return separator < 0 ? [arg.slice(2), 'true'] : [arg.slice(2, separator), arg.slice(separator + 1)]
  }))
  const rawLat = flags.get('lat') ?? process.env.AIR_QUALITY_TARGET_LAT
  const rawLon = flags.get('lon') ?? process.env.AIR_QUALITY_TARGET_LON
  const lat = rawLat?.trim() ? Number(rawLat) : Number.NaN
  const lon = rawLon?.trim() ? Number(rawLon) : Number.NaN
  const days = Number(flags.get('days') ?? process.env.AIR_QUALITY_BACKFILL_DAYS ?? 90)
  const stationLimit = Number(flags.get('stations') ?? process.env.AIR_QUALITY_STATION_LIMIT ?? 5)
  const rawFrom = flags.get('from') ?? process.env.AIR_QUALITY_BACKFILL_FROM
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error('VALID_TARGET_COORDINATES_REQUIRED')
  }
  return {
    lat,
    lon,
    days: Math.min(Math.max(Math.trunc(days) || 90, 1), 365),
    stationLimit: Math.min(Math.max(Math.trunc(stationLimit) || 1, 1), 25),
    // ย้อนหลังเกิน 365 วัน: ส่ง --from=YYYY-MM-DD (หรือตั้ง AIR_QUALITY_BACKFILL_FROM)
    from: rawFrom?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom.trim()) ? rawFrom.trim() : null,
  }
}
