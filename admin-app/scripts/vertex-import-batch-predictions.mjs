// Phase 6: import Vertex AI batch-prediction results into Supabase `pm25_forecast_daily`.
// Run AFTER a Vertex AI batch prediction job (see data/vertex/VERTEX_CONSOLE_STEPS.md):
//   node scripts/vertex-import-batch-predictions.mjs --file ../data/vertex/batch_predictions.jsonl --model <model-display-name>
//
// Supported input: JSONL (Vertex AI batch prediction output for time series) where each line is
//   {"instance": {"timestamp": "2026-10-03T00:00:00Z", "location_id": "1304082", ...},
//    "prediction": {"predicted_pm25": {"values": [24.5]}, "lower_bound_pm25": {"values": [18.2]},
//                   "upper_bound_pm25": {"values": [31.1]}, "prediction_interval": {"start": ..., "end": ...}}}
// Field names differ slightly between model versions; this script detects the common shapes and
// FAILS LOUDLY with an example line when it cannot — it never guesses values.
import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

nextEnv.loadEnvConfig(process.cwd())

const args = process.argv.slice(2)
const fileArg = args.indexOf('--file')
const modelArg = args.indexOf('--model')
const file = fileArg >= 0 ? args[fileArg + 1] : null
const modelVersion = modelArg >= 0 ? args[modelArg + 1] : 'vertex-manual-import'
if (!file) {
  console.error('Usage: node scripts/vertex-import-batch-predictions.mjs --file <path-to-batch-output> --model <model-version>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) { console.error('SUPABASE_SERVER_CONFIGURATION_MISSING'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// --- flexible field detection (documented shapes only, no guessing of values) ---
function unwrap(node) {
  if (node == null) return null
  if (typeof node === 'number') return node
  if (Array.isArray(node)) return unwrap(node[0])
  if (typeof node === 'object') {
    if ('values' in node) return unwrap(node.values)
    for (const key of ['value', 'prediction', 'predicted_pm25']) if (key in node) return unwrap(node[key])
    if ('lower_bound' in node) return unwrap(node.lower_bound)
    if ('upper_bound' in node) return unwrap(node.upper_bound)
  }
  return null
}

function parseLine(line, lineNo) {
  const json = JSON.parse(line)
  const instance = json.instance ?? json
  const prediction = json.prediction ?? {}
  const locationId = String(instance.location_id ?? instance.locationId ?? instance.station_id ?? '')
  let timestamp = String(instance.timestamp ?? instance.date ?? '')
  timestamp = timestamp.slice(0, 10)
  const value = unwrap(prediction.predicted_pm25 ?? prediction.value ?? prediction.predicted_value)
  const lower = unwrap(prediction.lower_bound_pm25 ?? prediction.lower_bound)
  const upper = unwrap(prediction.upper_bound_pm25 ?? prediction.upper_bound)
  if (!/^\d+$/.test(locationId) || !/^\d{4}-\d{2}-\d{2}$/.test(timestamp) || !Number.isFinite(Number(value))) {
    console.error(`UNRECOGNIZED_FORMAT at line ${lineNo}: expected instance.location_id + instance.timestamp + predicted pm25 value. Example parsed: ${JSON.stringify({ locationId, timestamp, value }).slice(0, 300)}`)
    process.exit(1)
  }
  // horizon = จำนวนวันนับจากวันแรกของไฟล์ภายในสถานีเดียวกัน จะคำนวณหลังจัดกลุ่ม
  return { stationId: locationId, date: timestamp, value: Number(value), lower: Number.isFinite(Number(lower)) ? Number(lower) : null, upper: Number.isFinite(Number(upper)) ? Number(upper) : null }
}

const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim())
const parsed = lines.map((line, index) => parseLine(line, index + 1))

// horizon ต่อสถานี = ลำดับวันที่ (วันแรกของสถานีในไฟล์ = horizon 1 = พรุ่งนี้)
const byStation = new Map()
for (const row of parsed) {
  if (!byStation.has(row.stationId)) byStation.set(row.stationId, [])
  byStation.get(row.stationId).push(row)
}
const upserts = []
for (const [, rows] of byStation) {
  rows.sort((a, b) => a.date.localeCompare(b.date))
  rows.forEach((row, index) => {
    upserts.push({
      station_id: row.stationId,
      date: row.date,
      pm25: row.value,
      pm25_min: row.lower,
      pm25_max: row.upper,
      horizon: index + 1,
      model_version: modelVersion,
      updated_at: new Date().toISOString(),
    })
  })
}

// upsert ทีละก้อน
let saved = 0
for (let i = 0; i < upserts.length; i += 500) {
  const chunk = upserts.slice(i, i + 500)
  const { error } = await db.from('pm25_forecast_daily').upsert(chunk, { onConflict: 'station_id,date' })
  if (error) { console.error('UPSERT_FAILED', error.code, error.message.slice(0, 200)); process.exit(1) }
  saved += chunk.length
}
console.log(JSON.stringify({ imported: saved, stations: byStation.size, modelVersion }, null, 1))
