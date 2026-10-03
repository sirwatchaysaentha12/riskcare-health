// Phase 2 of VERTEX-AI-FORECAST-PROMPT.md — baseline evaluation on a time-based holdout.
// Reads data/vertex/pm25_daily_vertex.csv (observed only). No Supabase, no secrets.
//
// Rules honoured:
// - Time-based split ONLY (no random split): Train 2023-09→2026-03-31 | Val 2026-04-01→06-30 | Test(holdout) 2026-07-01→09-30
// - A prediction for date t at horizon h uses ONLY observations ≤ (t - h). No leakage.
// - No accuracy claims beyond this measured holdout; results feed Phase 4 comparison.
//
// Usage: node scripts/vertex-eval-baselines.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const csvPath = new URL('../../data/vertex/pm25_daily_vertex.csv', import.meta.url)
const lines = readFileSync(csvPath, 'utf8').split('\n').filter((line) => line.trim())
const header = lines[0].split(',')
const col = (name) => header.indexOf(name)
const rows = lines.slice(1).map((line) => {
  const parts = line.split(',')
  return {
    timestamp: parts[col('timestamp')],
    locationId: parts[col('location_id')],
    pm25: Number(parts[col('pm25')]),
  }
})

const TEST_START = '2026-07-01'
const VAL_START = '2026-04-01'

// series per station, sorted by date
const series = new Map()
for (const row of rows) {
  if (!series.has(row.locationId)) series.set(row.locationId, new Map())
  series.get(row.locationId).set(row.timestamp, row.pm25)
}

// baseline predictors: (map of date->pm25, index of target date t, horizon h) → prediction or null
// every predictor may only look at dates strictly before t-h+1 … i.e. ≤ t-h
function predPersistence(dates, byDate, i, h) {
  const origin = dates[i - h]
  return origin == null ? null : byDate.get(origin)
}
function predMovingAverage3(dates, byDate, i, h) {
  const values = []
  for (let k = i - h; k > i - h - 3 && k >= 0; k--) values.push(byDate.get(dates[k]))
  return values.length === 3 ? values.reduce((a, b) => a + b, 0) / 3 : null
}
function predSeasonalNaive(dates, byDate, i, h) {
  // same weekday, previous week (7 days before target) — is ≤ origin date for h ≤ 7
  const target = dates[i]
  const targetTime = new Date(`${target}T00:00:00Z`).getTime()
  const past = new Date(targetTime - 7 * 86400000).toISOString().slice(0, 10)
  // must also be ≤ origin date (no leakage against origin)
  const origin = dates[i - h]
  return origin && past <= origin ? (byDate.get(past) ?? null) : null
}
function predMa3PlusTrend(dates, byDate, i, h) {
  // replicates production buildForecast() baseline: MA of last 3 days at origin + trend limited to ±15%/day,
  // rolled forward h days — same math as admin-app/src/lib/airQualityForecast.ts
  const values = []
  for (let k = i - h; k > i - h - 3 && k >= 0; k--) values.push(byDate.get(dates[k]))
  if (values.length < 3) return null
  const ma = values.reduce((a, b) => a + b, 0) / 3
  const older = []
  for (let k = i - h - 3; k > i - h - 6 && k >= 0; k--) older.push(byDate.get(dates[k]))
  let dailyChange = 0
  if (older.length === 3) {
    const prevAvg = older.reduce((a, b) => a + b, 0) / 3
    const diff = ma - prevAvg
    dailyChange = Math.min(Math.abs(diff) / 3, ma * 0.15) * (diff > 0 ? 1 : diff < 0 ? -1 : 0)
  }
  return Math.max(0, ma + dailyChange * h)
}

const baselines = [
  ['persistence', predPersistence],
  ['moving_avg_3', predMovingAverage3],
  ['seasonal_naive_weekly', predSeasonalNaive],
  ['ma3_plus_trend (production baseline)', predMa3PlusTrend],
]

function metrics(pairs) {
  const n = pairs.length
  if (!n) return null
  const errs = pairs.map(([a, p]) => a - p)
  const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / n
  const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / n)
  // MAPE เฉพาะค่าจริง ≥ 5 µg/m³ (ค่าต่ำมากทำ MAPE อิดเอื้อนจนไร้ความหมาย) — รายงาน n ที่ใช้แยกต่างหาก
  const mapeSample = pairs.filter(([a]) => a >= 5)
  const mape = mapeSample.length
    ? 100 * mapeSample.reduce((s, [a, p]) => s + Math.abs(a - p) / a, 0) / mapeSample.length
    : null
  // sMAPE ใช้ได้ทุกค่า (มีคูณ 2 กันศูนย์)
  const smape = 100 * pairs.reduce((s, [a, p]) => s + Math.abs(a - p) / ((Math.abs(a) + Math.abs(p)) / 2 || 1e-9), 0) / n
  return { n, mae: round(mae), rmse: round(rmse), mapePct: mape == null ? null : round(mape), smapePct: round(smape) }
}
const round = (v) => Math.round(v * 100) / 100

// evaluate per horizon on the TEST window
const results = {}
for (const h of [1, 2, 3]) {
  const perBaseline = Object.fromEntries(baselines.map(([name]) => [name, []]))
  for (const [, byDate] of series) {
    const dates = [...byDate.keys()].sort()
    for (let i = 0; i < dates.length; i++) {
      const t = dates[i]
      if (t < TEST_START) continue
      const actual = byDate.get(t)
      if (!Number.isFinite(actual)) continue
      for (const [name, fn] of baselines) {
        const p = fn(dates, byDate, i, h)
        if (p != null && Number.isFinite(p)) perBaseline[name].push([actual, p])
      }
    }
  }
  results[`h${h}`] = Object.fromEntries(baselines.map(([name]) => [name, metrics(perBaseline[name])]))
}

// per-station detail for h=1 (best baseline vs production baseline)
const perStation = []
for (const [stationId, byDate] of series) {
  const dates = [...byDate.keys()].sort()
  const errors = { persistence: [], moving_avg_3: [], 'ma3_plus_trend (production baseline)': [] }
  for (let i = 0; i < dates.length; i++) {
    const t = dates[i]
    if (t < TEST_START) continue
    const actual = byDate.get(t)
    if (!Number.isFinite(actual)) continue
    for (const name of Object.keys(errors)) {
      const fn = baselines.find(([n]) => n === name)[1]
      const p = fn(dates, byDate, i, 1)
      if (p != null && Number.isFinite(p)) errors[name].push(actual - p)
    }
  }
  const mae = (arr) => arr.length ? round(arr.reduce((a, b) => a + Math.abs(b), 0) / arr.length) : null
  perStation.push({
    stationId,
    n: errors.persistence.length,
    persistenceMae: mae(errors.persistence),
    ma3Mae: mae(errors.moving_avg_3),
    productionMae: mae(errors['ma3_plus_trend (production baseline)']),
  })
}
perStation.sort((a, b) => (a.stationId > b.stationId ? 1 : -1))

const output = {
  split: { train: '2023-09-28→2026-03-31', validation: '2026-04-01→2026-06-30', test: `${TEST_START}→2026-09-30 (holdout, never used for tuning)` },
  method: 'prediction for date t at horizon h uses only observations ≤ (t−h) — no leakage',
  byHorizon: results,
  perStationH1: perStation,
  sampleCountsNote: 'n = number of (station, date) forecast origins × 1 in the holdout window',
}
writeFileSync(new URL('../../data/vertex/baseline-eval-results.json', import.meta.url), JSON.stringify(output, null, 1))
console.log(JSON.stringify({ split: output.split, byHorizon: results }, null, 1))
