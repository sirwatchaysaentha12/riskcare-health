// Phase 1 (read-only): measure air_quality_daily content for the Vertex dataset design.
// Prints aggregate statistics only — never env values or secrets.
import nextEnv from '@next/env'
nextEnv.loadEnvConfig('C:/Users/ACER/projectweb/admin-app')
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) { console.error('SUPABASE_SERVER_CONFIGURATION_MISSING'); process.exit(1) }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const all = []
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('air_quality_daily').select('*').range(offset, offset + 999)
  if (error) { console.error('QUERY_FAILED', error.code); process.exit(1) }
  all.push(...(data || []))
  if ((data || []).length < 1000) break
}

const byStation = new Map()
for (const r of all) {
  const s = byStation.get(r.station_id) || { name: r.station_name, lat: r.latitude, lon: r.longitude, dates: [], pm25: [], missing: 0, weather: { temperature: 0, humidity: 0, wind_speed: 0, rainfall: 0 } }
  if (r.pm25 == null) s.missing += 1; else s.pm25.push(r.pm25)
  if (r.temperature != null) s.weather.temperature++
  if (r.humidity != null) s.weather.humidity++
  if (r.wind_speed != null) s.weather.wind_speed++
  if (r.rainfall != null) s.weather.rainfall++
  s.dates.push(r.date)
  byStation.set(r.station_id, s)
}

const dupCheck = new Map()
let duplicates = 0
for (const r of all) { const k = `${r.station_id}|${r.date}`; dupCheck.set(k, (dupCheck.get(k) || 0) + 1) }
for (const c of dupCheck.values()) if (c > 1) duplicates += c - 1

const allPm = all.filter(r => r.pm25 != null).map(r => r.pm25)
allPm.sort((a, b) => a - b)
const q = (p) => allPm.length ? allPm[Math.min(allPm.length - 1, Math.floor(p * allPm.length))] : null
// WHO-style screening outliers: outside [q0.01 - 3*IQR-ish] — simple report: below 0 or above P99.5*2
const outliers = all.filter(r => r.pm25 != null && (r.pm25 < 0 || r.pm25 > 350)).length

const dates = all.map(r => r.date).sort()
const stations = [...byStation.entries()].map(([id, s]) => ({
  id, name: s.name, lat: s.lat ? Number(s.lat).toFixed(3) : null, lon: s.lon ? Number(s.lon).toFixed(3) : null,
  days: s.dates.length, from: s.dates.sort()[0], to: s.dates.at(-1), missingPm25: s.missing,
  pm25min: s.pm25.length ? Math.min(...s.pm25).toFixed(1) : null, pm25max: s.pm25.length ? Math.max(...s.pm25).toFixed(1) : null,
  pm25mean: s.pm25.length ? (s.pm25.reduce((a, b) => a + b, 0) / s.pm25.length).toFixed(1) : null,
  weatherCover: s.weather,
}))

console.log(JSON.stringify({
  totalRows: all.length, duplicates,
  globalDateRange: dates.length ? [dates[0], dates.at(-1)] : null,
  pm25Stats: { n: allPm.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), outliersBeyond350: outliers },
  missingPm25Rows: all.filter(r => r.pm25 == null).length,
  stationsWithPm25: stations.filter(s => s.pm25min != null).length,
  stations: stations.sort((a, b) => b.days - a.days),
}, null, 1))
