/**
 * pipelineLogger.ts — บันทึก pipeline_runs ลง Supabase
 *
 * กฎ:
 * - ไม่ throw ข้ามชั้น (ล้มเงียบๆ ถ้า DB ไม่พร้อม)
 * - ไม่พิมพ์ค่า secret
 * - ตาราง pipeline_runs ต้องมีก่อน (รัน SQL migration ก่อน)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type PipelineRunStatus = 'ok' | 'partial' | 'failed'

export interface PipelineRunPayload {
  runDate: string          // YYYY-MM-DD (Bangkok time)
  status: PipelineRunStatus
  startedAt: string        // ISO timestamp
  finishedAt?: string
  stationsTotal?: number
  stationsMissing?: string[]
  provincesCovered?: number
  phase?: string
  /** provider ที่ใช้จริง: pcd / openaq / none */
  providerUsed?: string
  /** สถานะโดยรวม: ok / degraded */
  pipelineStatus?: string
  detail?: Record<string, unknown>
}

let client: SupabaseClient | undefined

function getClient(): SupabaseClient | null {
  if (client) return client
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !key) return null
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return client
}

export async function logPipelineRun(payload: PipelineRunPayload): Promise<void> {
  const db = getClient()
  if (!db) {
    console.warn('[pipelineLogger] Supabase client not available — skipping log')
    return
  }
  try {
    const { error } = await db.from('pipeline_runs').insert({
      run_date: payload.runDate,
      status: payload.status,
      started_at: payload.startedAt,
      finished_at: payload.finishedAt ?? new Date().toISOString(),
      stations_total: payload.stationsTotal ?? null,
      stations_missing: payload.stationsMissing ?? [],
      provinces_covered: payload.provincesCovered ?? null,
      phase: payload.phase ?? null,
      detail: {
        providerUsed: payload.providerUsed ?? 'unknown',
        pipelineStatus: payload.pipelineStatus ?? payload.status,
        ...(payload.detail ?? {}),
      },
    })
    if (error) {
      // ตารางยังไม่ถูกสร้าง หรือ schema เก่า — log เงียบๆ ไม่ throw
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        console.warn('[pipelineLogger] pipeline_runs table not found — run SQL migration first')
      } else {
        console.warn('[pipelineLogger] insert failed:', error.code)
      }
    }
  } catch (err) {
    console.warn('[pipelineLogger] unexpected error:', err instanceof Error ? err.message : 'unknown')
  }
}

export async function getLatestPipelineRun(): Promise<{
  runDate: string
  status: PipelineRunStatus
  finishedAt: string | null
  detail: Record<string, unknown> | null
} | null> {
  const db = getClient()
  if (!db) return null
  try {
    const { data, error } = await db
      .from('pipeline_runs')
      .select('run_date,status,finished_at,detail')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return {
      runDate: String(data.run_date),
      status: data.status as PipelineRunStatus,
      finishedAt: data.finished_at ? String(data.finished_at) : null,
      detail: (data.detail as Record<string, unknown>) ?? null,
    }
  } catch {
    return null
  }
}
