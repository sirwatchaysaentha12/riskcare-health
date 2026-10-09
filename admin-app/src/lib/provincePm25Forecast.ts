import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const PM25_FROZEN_MODEL_VERSION = '2.7-local-2026-10-01'
export const PM25_FROZEN_MODEL_TRAINED_UNTIL = '2026-09-30'
// Frozen from notebooks/pm25_model_v2.7_filtered.metadata.json station mapping.
export const PM25_FROZEN_MODEL_SUPPORTED_PROVINCES = ['กรุงเทพมหานคร'] as const

export type ProvinceForecastPoint = {
  date: string
  value: number
  horizon: number
  modelVersion: string
  updatedAt: string
  stationCount: number
}

export type ProvinceForecastResult = {
  points: ProvinceForecastPoint[]
  updatedAt: string | null
  stale: boolean
  stationCount: number
  schemaReady: boolean
}

let adminClient: SupabaseClient | undefined

function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null
  adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  return adminClient
}

const bangkokToday = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)

export async function getProvincePm25Forecast(
  province: string,
  modelVersion = PM25_FROZEN_MODEL_VERSION,
): Promise<ProvinceForecastResult> {
  const client = getAdminClient()
  if (!client) return { points: [], updatedAt: null, stale: false, stationCount: 0, schemaReady: false }

  const { data, error } = await client
    .from('pm25_forecast_daily')
    .select('station_id,province,date,pm25,horizon,model_version,updated_at')
    .eq('province', province)
    .eq('model_version', modelVersion)
    .gte('date', bangkokToday())
    .order('date', { ascending: true })
    .limit(500)

  if (error) {
    if (
      error.code === '42P01'
      || error.code === '42703'
      || error.code === 'PGRST204'
      || error.code === 'PGRST205'
      || /does not exist|could not find/i.test(error.message)
    ) {
      return { points: [], updatedAt: null, stale: false, stationCount: 0, schemaReady: false }
    }
    throw new Error(`PROVINCE_FORECAST_QUERY_FAILED:${error.code || 'DATABASE_ERROR'}`)
  }

  const grouped = new Map<string, Array<{ value: number; horizon: number; updatedAt: string; stationId: string }>>()
  for (const row of data ?? []) {
    const date = String(row.date ?? '').slice(0, 10)
    const value = Number(row.pm25)
    const updatedAt = String(row.updated_at ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value < 0 || value > 500 || !updatedAt) continue
    const values = grouped.get(date) ?? []
    values.push({
      value,
      horizon: Number.isFinite(Number(row.horizon)) ? Number(row.horizon) : 0,
      updatedAt,
      stationId: String(row.station_id ?? ''),
    })
    grouped.set(date, values)
  }

  const points = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, rows]) => {
    const latestUpdatedAt = rows.map((row) => row.updatedAt).sort().at(-1)!
    return {
      date,
      value: Math.round((rows.reduce((sum, row) => sum + row.value, 0) / rows.length) * 10) / 10,
      horizon: Math.max(...rows.map((row) => row.horizon)),
      modelVersion,
      updatedAt: latestUpdatedAt,
      stationCount: new Set(rows.map((row) => row.stationId)).size,
    }
  })
  const updatedAt = points.map((point) => point.updatedAt).sort().at(-1) ?? null
  const stale = updatedAt ? Date.now() - Date.parse(updatedAt) > 2 * 24 * 60 * 60 * 1000 : false
  return {
    points,
    updatedAt,
    stale,
    stationCount: Math.max(0, ...points.map((point) => point.stationCount)),
    schemaReady: true,
  }
}
