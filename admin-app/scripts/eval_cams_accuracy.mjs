import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../.env.local')

let env = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=')
      const k = trimmed.slice(0, idx).trim()
      const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      env[k] = v
    }
  })
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const openMeteoKey = env.OPEN_METEO_API_KEY || env.OPENMETEO_API_KEY || process.env.OPEN_METEO_API_KEY

const HARDCODED_STATION_COORDS = {
  '1304328': { lat: 13.7328, lon: 100.4877, name: 'กรุงเทพฯ (ธนบุรี)' },
  '1305020': { lat: 13.7627, lon: 100.5502, name: 'กรุงเทพฯ (ดินแดง)' },
  '5077771': { lat: 13.6682, lon: 100.6050, name: 'กรุงเทพฯ (บางนา)' },
}

async function run() {
  let dbRows = []
  if (supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/air_quality_daily?select=station_id,date,pm25&date=gte.2026-10-01&date=lte.2026-10-07&limit=1000`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      )
      if (res.ok) {
        dbRows = await res.json()
      }
    } catch (e) {
      console.error('Failed to query Supabase:', e.message)
    }
  }

  console.log(`Fetched ${dbRows.length} ground station daily rows for Oct 1-7, 2026`)

  const stationIds = [...new Set(dbRows.map((r) => r.station_id))]
  const stations = stationIds.map((id) => ({
    id,
    ...(HARDCODED_STATION_COORDS[id] || { lat: 13.7563, lon: 100.5018, name: 'กรุงเทพมหานคร' }),
  }))

  const base = openMeteoKey
    ? 'https://customer-air-quality-api.open-meteo.com/v1/air-quality'
    : 'https://air-quality-api.open-meteo.com/v1/air-quality'

  const lats = stations.map((s) => s.lat).join(',')
  const lons = stations.map((s) => s.lon).join(',')

  const url = `${base}?latitude=${lats}&longitude=${lons}&hourly=pm2_5&start_date=2026-10-01&end_date=2026-10-07&timezone=Asia%2FBangkok${openMeteoKey ? `&apikey=${openMeteoKey}` : ''}`
  
  const omRes = await fetch(url)
  const omData = await omRes.json()
  const arr = Array.isArray(omData) ? omData : [omData]

  // Map each station id -> (date -> pm25)
  const camsMapByStation = new Map()
  arr.forEach((item, index) => {
    const stId = stations[index]?.id
    if (!stId) return
    const times = item.hourly?.time || []
    const values = item.hourly?.pm2_5 || []
    const dateGroups = new Map()
    for (let i = 0; i < times.length; i++) {
      const d = times[i].slice(0, 10)
      const v = values[i]
      if (!dateGroups.has(d)) dateGroups.set(d, [])
      if (v != null && Number.isFinite(v)) dateGroups.get(d).push(v)
    }
    const dailyMap = new Map()
    dateGroups.forEach((samples, d) => {
      if (samples.length >= 18) {
        const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10
        dailyMap.set(d, avg)
      }
    })
    camsMapByStation.set(stId, dailyMap)
  })

  const pairs = []
  dbRows.forEach((row) => {
    const dailyMap = camsMapByStation.get(row.station_id)
    const camsVal = dailyMap?.get(row.date)
    if (camsVal != null && row.pm25 != null && Number.isFinite(Number(row.pm25))) {
      pairs.push({ actual: Number(row.pm25), cams: camsVal, date: row.date, stationId: row.station_id })
    }
  })

  console.log(`Matched ${pairs.length} pairs of ground station vs CAMS values`)

  const n = pairs.length
  let sumAbsDiff = 0
  let sumSqDiff = 0
  let sumDiff = 0

  pairs.forEach((p) => {
    const diff = p.cams - p.actual
    sumAbsDiff += Math.abs(diff)
    sumSqDiff += diff * diff
    sumDiff += diff
  })

  const mae = n > 0 ? Math.round((sumAbsDiff / n) * 100) / 100 : 0
  const rmse = n > 0 ? Math.round(Math.sqrt(sumSqDiff / n) * 100) / 100 : 0
  const bias = n > 0 ? Math.round((sumDiff / n) * 100) / 100 : 0

  const summary = {
    period: '2026-10-01 to 2026-10-07',
    station: `กรุงเทพมหานคร (${stationIds.length} สถานี)`,
    n,
    mae,
    rmse,
    bias,
    formattedText: `เทียบสถานีกรุงเทพฯ ช่วง 1–7 ต.ค. คลาดเคลื่อนเฉลี่ย ${mae} µg/m³ (n=${n})`,
  }

  console.log('\n=== CAMS ACCURACY COMPARISON (OCT 1-7, 2026) ===')
  console.log(JSON.stringify(summary, null, 2))

  const outPath = path.join(__dirname, '../src/data/camsAccuracyStats.json')
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8')

  const feOutPath = path.join(__dirname, '../../frontend/src/data/camsAccuracyStats.json')
  fs.writeFileSync(feOutPath, JSON.stringify(summary, null, 2), 'utf8')
}

run()
