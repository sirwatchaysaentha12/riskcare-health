// Pure hourly persistence forecast builder — โมเดลที่วัดแล้วชนะเป้า ±2/±3 @87-90% ทุกฤดู
// หลักฐาน: data/vertex/round1_hourly_push.json (N=27,929/27,865/27,835, 2021-2026 คลุมฤดูฝุ่น)
// กฎ: ทำนายเฉพาะเมื่อมีค่าวัดจริงล่าสุด ห้ามเดาค่าว่าง (เช่นเดียวกับ buildForecast รายวัน)
export const HOURLY_MODEL_VERSION = 'hourly-persistence-v1'

// Accuracy@±2/±3 ที่วัดจริงจาก round1_hourly_push.py (ค่าคงที่ ปรับเมื่อรัน eval ใหม่เท่านั้น)
export const HOURLY_MEASURED_ACCURACY = {
  protocol: '3 สถานีกรุงเทพฯ · 2021-2026 ทุกฤดูรวมฤดูฝุ่น · split ตามเวลา · ไม่มี leakage',
  byHorizon: {
    1: { '±2': 99.2, '±3': 99.8, '±5': 100.0, MAE: 0.37, N: 27929 },
    2: { '±2': 95.0, '±3': 98.4, '±5': 99.7, MAE: 0.67, N: 27865 },
    3: { '±2': 89.0, '±3': 95.4, '±5': 99.1, MAE: 0.96, N: 27835 },
  },
}

export type HourlyPoint = { tsUtc: string; pm25: number }

export type HourlyForecastPoint = {
  horizonHours: number
  timeUtc: string
  pm25: number
  dataType: 'forecast'
  modelVersion: string
}

export type HourlyForecastResult = {
  observed: { timeUtc: string; pm25: number } | null
  forecast: HourlyForecastPoint[]
  stale: boolean
}

const FRESH_MS = 3 * 60 * 60 * 1000

// series = ค่าวัดรายชั่วโมงเรียงเก่า→ใหม่ (กรองค่าว่างแล้ว) · nowMs = เวลาอ้างอิง (ms)
// คืน null ทั้งก้อนเมื่อไม่มีค่าวัดจริง — ห้าม fallback เงียบ ๆ
export function buildHourlyPersistenceForecast(series: HourlyPoint[], nowMs: number, horizons: number[] = [1, 2, 3]): HourlyForecastResult | null {
  const usable = (series || []).filter((p) => p && Number.isFinite(Number(p.pm25)) && Number(p.pm25) >= 0 && Boolean(p.tsUtc))
  if (!usable.length) return null
  const last = usable[usable.length - 1]
  const lastMs = Date.parse(last.tsUtc)
  if (!Number.isFinite(lastMs)) return null
  const stale = nowMs - lastMs > FRESH_MS
  const forecast = horizons.map((h) => ({
    horizonHours: h,
    timeUtc: new Date(lastMs + h * 60 * 60 * 1000).toISOString(),
    pm25: Math.round(last.pm25 * 10) / 10,
    dataType: 'forecast' as const,
    modelVersion: HOURLY_MODEL_VERSION,
  }))
  return { observed: { timeUtc: last.tsUtc, pm25: Math.round(last.pm25 * 10) / 10 }, forecast, stale }
}
