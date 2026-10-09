import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null
}

export async function GET() {
  const db = client()
  if (!db) return NextResponse.json({ state: 'error', message: 'ขาดการตั้งค่า server' }, { status: 500 })
  const [mapping, forecasts, runs] = await Promise.all([
    db.from('province_stations').select('province,active'),
    db.from('pm25_forecast').select('province,model_version,issued_date,target_date').order('issued_date', { ascending: false }).limit(1000),
    db.from('pipeline_runs').select('run_date,status,started_at,finished_at,missing_stations,detail').order('started_at', { ascending: false }).limit(10),
  ])
  const missing = [mapping.error, forecasts.error, runs.error].find(Boolean)
  if (missing) return NextResponse.json({ state: 'error', message: 'ยังไม่ได้ติดตั้งตาราง pipeline ครบ', error: missing.code }, { status: 200 })
  const activeProvinces = new Set((mapping.data || []).filter((row) => row.active).map((row) => row.province))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const current = new Set((forecasts.data || []).filter((row) => row.issued_date === today).map((row) => row.province))
  const modelVersions = [...new Set((forecasts.data || []).map((row) => row.model_version))]
  const lastRun = runs.data?.[0] || null
  return NextResponse.json({ state: 'ok', expectedProvinces: 77,
    statusCounts: { ok: current.size, unsupported: Math.max(0, 77 - activeProvinces.size),
      stale: Math.max(0, activeProvinces.size - current.size), error: lastRun?.status === 'failed' ? 1 : 0 },
    activeMappedProvinces: activeProvinces.size, provincesWithCurrentForecast: current.size,
    modelVersions, lastRun, recentRuns: runs.data || [] })
}
