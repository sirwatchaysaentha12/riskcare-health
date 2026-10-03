import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface DailyAirQualityRecord {
  id?: number
  /** OpenAQ PM2.5 sensor ID; identifies a specific measurement time series. */
  station_id: string
  station_name: string | null
  latitude: number | null
  longitude: number | null
  date: string
  pm25: number | null
  pm10: number | null
  temperature: number | null
  humidity: number | null
  pressure: number | null
  wind_speed: number | null
  wind_direction: number | null
  rainfall: number | null
  created_at?: string
  updated_at?: string
}

export interface StationWithLatestData {
  station_id: string
  station_name: string | null
  latitude: number | null
  longitude: number | null
  latest_date: string
}

let adminClient: SupabaseClient | undefined

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_SERVER_CONFIGURATION_MISSING')
  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return adminClient
}

function assertStationId(stationId: string): string {
  const normalized = stationId.trim()
  if (!normalized) throw new Error('STATION_ID_REQUIRED')
  return normalized
}

function bangkokDate(daysAgo = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  const date = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) - daysAgo))
  return date.toISOString().slice(0, 10)
}

export async function saveDailyAirQuality(data: DailyAirQualityRecord): Promise<DailyAirQualityRecord> {
  const stationId = assertStationId(data.station_id)
  const { data: saved, error } = await getAdminClient()
    .from('air_quality_daily')
    .upsert({ ...data, station_id: stationId }, { onConflict: 'station_id,date' })
    .select('*')
    .single()
  if (error) throw new Error(`AIR_QUALITY_UPSERT_FAILED:${error.code || 'DATABASE_ERROR'}`)
  return saved as DailyAirQualityRecord
}

export async function getDailyHistory(station_id: string, days: number): Promise<DailyAirQualityRecord[]> {
  const stationId = assertStationId(station_id)
  const boundedDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365)
  const fromDate = bangkokDate(boundedDays - 1)
  const { data, error } = await getAdminClient()
    .from('air_quality_daily')
    .select('*')
    .eq('station_id', stationId)
    .gte('date', fromDate)
    .lte('date', bangkokDate())
    .order('date', { ascending: false })
    .limit(boundedDays)
  if (error) throw new Error(`AIR_QUALITY_HISTORY_QUERY_FAILED:${error.code || 'DATABASE_ERROR'}`)
  return (data || []) as DailyAirQualityRecord[]
}

export async function getLatestDaily(station_id: string): Promise<DailyAirQualityRecord | null> {
  const stationId = assertStationId(station_id)
  const { data, error } = await getAdminClient()
    .from('air_quality_daily')
    .select('*')
    .eq('station_id', stationId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`AIR_QUALITY_LATEST_QUERY_FAILED:${error.code || 'DATABASE_ERROR'}`)
  return data as DailyAirQualityRecord | null
}

export async function getStationsWithData(): Promise<StationWithLatestData[]> {
  const client = getAdminClient()
  const pageSize = 1000
  const latestByStation = new Map<string, StationWithLatestData>()
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from('air_quality_daily')
      .select('station_id,station_name,latitude,longitude,date')
      .order('date', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`AIR_QUALITY_STATIONS_QUERY_FAILED:${error.code || 'DATABASE_ERROR'}`)
    const rows = data || []
    for (const row of rows) {
      if (!latestByStation.has(row.station_id)) {
        latestByStation.set(row.station_id, {
          station_id: row.station_id,
          station_name: row.station_name,
          latitude: row.latitude,
          longitude: row.longitude,
          latest_date: row.date,
        })
      }
    }
    if (rows.length < pageSize) break
  }
  return [...latestByStation.values()]
}
