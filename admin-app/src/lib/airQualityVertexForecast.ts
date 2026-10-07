// Phase 6 of VERTEX-AI-FORECAST-PROMPT.md — server-side Vertex AI forecast provider.
// Reads batch-prediction results from Supabase table `pm25_forecast_daily`
// (populated by scripts/vertex-import-batch-predictions.mjs after a Vertex AI batch job).
//
// Design rules honoured:
// - Frontend NEVER touches Vertex AI or credentials — it only reads our dashboard API.
// - If the table is missing (not yet created), config is absent, or there are no rows
//   for a station, this provider returns null and the caller falls back to the named
//   baseline forecast (labelled `baseline-ma3trend-v1`) — never fabricates values.
// - Every returned row carries dataType/horizon/modelVersion/updatedAt for auditability.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface VertexForecastPoint {
  date: string
  value: number
  min: number | null
  max: number | null
  horizon: number
  modelVersion: string
  updatedAt: string
}

export interface VertexForecastResult {
  points: VertexForecastPoint[]
  complete: boolean
}

export const BASELINE_MODEL_VERSION = 'baseline-pers-ma7blend-w05-v1'

let adminClient: SupabaseClient | undefined

function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null
  adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  return adminClient
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PM25_REASONABLE_MAX = 500 // µg/m³ — ตัวกรองค่าประหลาดจากโมเดล ไม่ใช่การสร้างค่า

export async function getVertexForecasts(stationId: string, horizonDays = 3): Promise<VertexForecastResult | null> {
  const client = getAdminClient()
  if (!client) return null
  // ตารางอาจยังไม่ถูกสร้าง (ผู้ใช้ยังไม่รัน migration) — ถือว่าไม่มีผล Vertex แล้ว fallback baseline
  let rows: Record<string, unknown>[] | null = null
  let missingTable = false
  const todayKey = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  {
    const { data, error } = await client
      .from('pm25_forecast_daily')
      .select('station_id,date,pm25,pm25_min,pm25_max,horizon,model_version,updated_at')
      .eq('station_id', stationId)
      // กรองวันเก่าที่ตกค้างใน query — ไม่งั้นมันกิน quota limit จนวันใหม่ขาด
      .gte('date', todayKey)
      // ตารางสะสมแถวเก่าหลายเดือน — ต้องเอา "ใหม่สุด" (ascending+limit จะได้แถว มี.ค. แล้วถูกกรองวันที่ตัดหมด → fallback ตลอด)
      .order('date', { ascending: false })
      .limit(horizonDays * 2)
    if (error) {
      // ตารางยังไม่ถูกสร้าง: Postgres 42P01 หรือ PostgREST PGRST205 ("Could not find the table ... in the schema cache")
      if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find/i.test(error.message)) missingTable = true
      else throw new Error(`FORECAST_QUERY_FAILED:${error.code || 'DATABASE_ERROR'}`)
    }
    rows = data
  }
  if (missingTable || !rows?.length) return null

  // Validate before serving (spec: "Backend ต้องตรวจ Schema และชนิดข้อมูลก่อนส่ง Frontend")
  const points: VertexForecastPoint[] = []
  for (const row of rows) {
    const date = String(row.date ?? '').slice(0, 10)
    const value = Number(row.pm25)
    if (!DATE_PATTERN.test(date) || date < todayKey) continue
    if (!Number.isFinite(value) || value < 0 || value > PM25_REASONABLE_MAX) continue
    const min = row.pm25_min == null ? null : Number(row.pm25_min)
    const max = row.pm25_max == null ? null : Number(row.pm25_max)
    points.push({
      date,
      value: Math.round(value * 10) / 10,
      min: min != null && Number.isFinite(min) ? Math.round(min * 10) / 10 : null,
      max: max != null && Number.isFinite(max) ? Math.round(max * 10) / 10 : null,
      horizon: Number.isFinite(Number(row.horizon)) ? Number(row.horizon) : 0,
      modelVersion: String(row.model_version ?? 'vertex-unknown'),
      updatedAt: String(row.updated_at ?? ''),
    })
  }
  if (!points.length) return null
  points.sort((a, b) => a.date.localeCompare(b.date))  // คืนเรียงเก่า→ใหม่ (desc query แล้ว)
  // ตัดเอาวันใหม่สุด N วัน — แถววันเก่าตกค้าง (publish รอบก่อน) ห้ามกินโควตา
  return { points: points.slice(-horizonDays), complete: points.length >= horizonDays }
}
