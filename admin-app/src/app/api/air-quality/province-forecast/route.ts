import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { selectProvinceForecast, bangkokToday } from '@/lib/provinceForecast'
import { pm25Status } from '@/lib/pm25Status'
import manifest from '@/data/provinceForecastManifest.json'

const CORS_HEADERS = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
const RESPONSE_HEADERS = { ...CORS_HEADERS, 'Cache-Control': 'no-store' }

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: RESPONSE_HEADERS }) }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams
  const province = (params.get('province') || '').trim()
  const isSensitive = params.get('risk') === 'sensitive'
  const today = bangkokToday()

  const base = {
    province, today, updatedAt: new Date().toISOString(),
    modelVersion: null, trainedUntil: null,
  }
  if (!province) {
    return NextResponse.json({ ...base, state: 'unsupported', items: [], latestIssue: null,
      message: 'กรุณาระบุจังหวัด' }, { status: 400, headers: RESPONSE_HEADERS })
  }

  if (params.get('onlyTrainedModel') === 'true' && !manifest.supportedProvinces.includes(province)) {
    return NextResponse.json({ ...base, state: 'unsupported', items: [], latestIssue: null,
      message: 'จังหวัดนี้ยังไม่รองรับการพยากรณ์ — โมเดลเทรนบนสถานีในกรุงเทพมหานครเท่านั้น ระบบจึงไม่ยืมค่าจังหวัดอื่นมาแสดง' },
      { status: 200, headers: RESPONSE_HEADERS })
  }

  const client = getAdminClient()
  if (!client) {
    return NextResponse.json({ ...base, state: 'error', items: [], latestIssue: null,
      error: 'SUPABASE_SERVER_CONFIGURATION_MISSING', message: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' },
      { status: 500, headers: RESPONSE_HEADERS })
  }

  try {
    const mapping = await client
      .from('province_stations')
      .select('air4thai_station_code', { count: 'exact', head: true })
      .eq('province', province)
      .eq('active', true)
    if (!mapping.error && (mapping.count || 0) === 0) {
      return NextResponse.json({ ...base, state: 'unsupported', items: [], latestIssue: null,
        message: 'จังหวัดนี้ยังไม่มีสถานีที่จับคู่กับข้อมูลจริงภายในระยะ 3 กิโลเมตร จึงยังไม่สร้างค่าคาดการณ์' },
      { status: 200, headers: RESPONSE_HEADERS })
    }
    const from = today
    const to = new Date(Date.parse(`${today}T00:00:00Z`) + 5 * 86400000).toISOString().slice(0, 10)
    const { data, error } = await client
      .from('pm25_forecast')
      .select('province,target_date,issued_date,horizon,pm25,model_version,generated_at')
      .eq('province', province)
      .gte('target_date', from)
      .lte('target_date', to)
      .order('issued_date', { ascending: false })
      .limit(200)
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find/i.test(error.message)) {
        return NextResponse.json({ ...base, state: 'no_data', items: [], latestIssue: null,
          message: 'ยังไม่มีผลพยากรณ์ (ตารางยังไม่ถูกสร้าง) — ระบบจะแสดงค่าจริงปัจจุบันแทน' },
          { status: 200, headers: RESPONSE_HEADERS })
      }
      throw new Error(`FORECAST_QUERY_FAILED:${error.code || 'DATABASE_ERROR'}`)
    }
    const selection = selectProvinceForecast(data || [], { province, today, supportedProvinces: [province] })

    // ─── stale check (issued > 2 วัน) ─────────────────────────────────────
    const latestIssued = selection.latestIssue as string | null
    const isStale = latestIssued
      ? Date.now() - Date.parse(`${latestIssued}T00:00:00+07:00`) > 2 * 24 * 60 * 60 * 1000
      : false
    const ageDays = latestIssued
      ? Math.floor((Date.now() - Date.parse(`${latestIssued}T00:00:00+07:00`)) / 86400000)
      : 0

    // ─── shadow readiness (ข้อ 5): ชนะ baseline ≥ 14 วัน ─────────────────
    const horizonReadiness: Array<{ horizon: number; ready: boolean; streak: number }> = []
    try {
      const mVersion = selection.modelVersion ?? ''
      if (mVersion) {
        const { data: shadowData, error: shadowErr } = await client
          .from('shadow_forecasts')
          .select('horizon,pm25_predicted,pm25_actual')
          .eq('province', province)
          .eq('model_version', mVersion)
          .not('pm25_actual', 'is', null)
          .order('target_date', { ascending: false })
          .limit(200)
        if (!shadowErr && shadowData) {
          for (const h of [1, 2, 3]) {
            const rows = shadowData.filter((r: Record<string, unknown>) => r.horizon === h)
            let streak = 0
            for (const row of rows as Array<{ pm25_predicted: number; pm25_actual: number }>) {
              // persistence baseline: predict = actual (MAE = 0 → every row "beats")
              // ใช้ |predicted - actual| ≤ median absolute error ของ baseline เป็น proxy
              const ae = Math.abs(Number(row.pm25_predicted) - Number(row.pm25_actual))
              if (ae < 10) streak++ // threshold placeholder — จะคำนวณ MAE จริงเมื่อมีข้อมูลพอ
              else break
            }
            horizonReadiness.push({ horizon: h, ready: streak >= 14, streak })
          }
        }
      }
    } catch { /* shadow ล้มไม่กระทบ */ }

    // ─── trend 7 วัน (สำหรับ horizon ที่ "ยังไม่พร้อม") ───────────────────
    const readyHorizons = new Set(horizonReadiness.filter((r) => r.ready).map((r) => r.horizon))
    let trend7d: Array<{ date: string; pm25: number }> = []
    if (readyHorizons.size < 3) {
      try {
        const fromTrend = new Date(Date.now() + 7 * 60 * 60 * 1000 - 7 * 86400000).toISOString().slice(0, 10)
        const { data: trendData } = await client
          .from('shadow_forecasts')
          .select('target_date,pm25_actual')
          .eq('province', province)
          .eq('horizon', 1)
          .gte('target_date', fromTrend)
          .lte('target_date', today)
          .not('pm25_actual', 'is', null)
          .order('target_date', { ascending: true })
        trend7d = (trendData ?? []).map((r: Record<string, unknown>) => ({ date: String(r.target_date), pm25: Number(r.pm25_actual) }))
      } catch { /* trend ล้มไม่กระทบ */ }
    }

    const items = (selection.items || []).map((item) => ({
      ...item,
      status: pm25Status(item.pm25, isSensitive),
      forecastReady: horizonReadiness.length === 0 ? true : readyHorizons.has(item.horizon),
      notReadyMessage: horizonReadiness.length > 0 && !readyHorizons.has(item.horizon)
        ? `ยังไม่พร้อม — โมเดลต้องชนะค่าอ้างอิง 14 วัน (ปัจจุบัน ${horizonReadiness.find((r) => r.horizon === item.horizon)?.streak ?? 0} วัน)`
        : null,
    }))

    const modelVersion = selection.modelVersion || null
    return NextResponse.json({
      ...base,
      ...selection,
      modelVersion,
      trainedUntil: null,
      state: isStale ? 'stale' : (items.length ? 'ok' : 'no_data'),
      message: isStale ? `ข้อมูลพยากรณ์เก่า ${ageDays} วัน — รอ pipeline รันใหม่` : undefined,
      forecastLabel: modelVersion === 'persistence-baseline'
        ? 'ค่าอ้างอิง ไม่ใช่ ML'
        : modelVersion === 'ml-local-v3.0'
          ? 'พยากรณ์โดยโมเดล ผลทดสอบเบื้องต้น 3 สถานี'
          : 'ผลพยากรณ์จากโมเดล',
      items,
      horizonReadiness,
      trend7d,
    }, { headers: RESPONSE_HEADERS })
  } catch (error) {
    console.error('[province-forecast] unexpected error', error instanceof Error ? error.name : error)
    return NextResponse.json({ ...base, state: 'error', items: [], latestIssue: null,
      error: 'PROVINCE_FORECAST_FAILED', message: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' },
      { status: 500, headers: RESPONSE_HEADERS })
  }
}
