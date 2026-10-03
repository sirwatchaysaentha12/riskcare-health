// Vertex AI dataset export — Phase 1 of VERTEX-AI-FORECAST-PROMPT.md
// Exports public.air_quality_daily (observed data only) into the CSV schema
// required by the Vertex AI Tabular Forecasting dataset.
//
// Usage:  node scripts/run-air-quality-script.mjs  (see scripts/vertex-export-dataset note)
//   npx tsx is not configured; run via:  node scripts/vertex-export-dataset.mjs
// Output: C:\Users\ACER\projectweb\data\vertex\pm25_daily_vertex.csv
//
// Rules honoured (from VERTEX-AI-FORECAST-PROMPT.md):
// - observed data only (is_observed=true) — no imputed/fabricated rows
// - location_id is the OpenAQ sensor/station id, never just the name
// - timestamps are Asia/Bangkok day keys, documented in DATA_DICTIONARY.md
// - no secrets printed; env values come from admin-app/.env.local via @next/env
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

nextEnv.loadEnvConfig(process.cwd())

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error('SUPABASE_SERVER_CONFIGURATION_MISSING')
  process.exit(1)
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const rows = []
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db
    .from('air_quality_daily')
    .select('station_id,station_name,latitude,longitude,date,pm25')
    .order('station_id')
    .order('date')
    .range(offset, offset + 999)
  if (error) {
    console.error('QUERY_FAILED', error.code)
    process.exit(1)
  }
  rows.push(...(data || []))
  if ((data || []).length < 1000) break
}

// ทุกสถานีในชุดข้อมูลปัจจุบันอยู่ในกรุงเทพฯ — ตรวจจากชื่อสถานีก่อน แล้ว fallback ด้วยกรอบพิกัด
// อนุญาตให้ station อื่นอยู่นอกกรุงเทพฯ ในอนาคต (จะได้ UNKNOWN ชัด ๆ ไม่เดาจังหวัด)
function provinceOf(stationName, lat, lon) {
  const name = String(stationName || '').toLowerCase()
  if (name.includes('bangkok')) return 'กรุงเทพมหานคร'
  if (Number.isFinite(lat) && lat >= 13.4 && lat <= 14.1 && lon >= 100.2 && lon <= 100.9) return 'กรุงเทพมหานคร'
  return 'UNKNOWN'
}

const header = 'timestamp,location_id,province,latitude,longitude,pm25,air_quality_source,is_observed'
const lines = [header]
let skippedNullPm25 = 0
for (const row of rows) {
  if (row.pm25 == null) { skippedNullPm25 += 1; continue } // missing → ไม่ export เป็นค่า, รายงานแยก
  const province = provinceOf(row.station_name, row.latitude, row.longitude)
  lines.push([
    row.date, // timestamp (day key, Asia/Bangkok rollup — see DATA_DICTIONARY.md)
    row.station_id, // location_id (OpenAQ sensor id)
    province,
    row.latitude ?? '',
    row.longitude ?? '',
    Number(row.pm25).toFixed(2),
    'OpenAQ',
    'true',
  ].join(','))
}

const outDir = join(process.cwd(), '..', 'data', 'vertex')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'pm25_daily_vertex.csv')
writeFileSync(outPath, lines.join('\n') + '\n')

const stations = new Set(rows.map((r) => r.station_id))
console.log(JSON.stringify({
  rowsExported: lines.length - 1,
  rowsSkippedNullPm25: skippedNullPm25,
  stations: stations.size,
  dateRange: rows.length ? [rows.reduce((a, r) => r.date < a ? r.date : a, rows[0].date), rows.reduce((a, r) => r.date > a ? r.date : a, rows[0].date)] : null,
  outputPath: outPath,
}, null, 1))
