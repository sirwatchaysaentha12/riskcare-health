import { pm25Status } from './pm25Status.ts'

export type AirQualityForecastPoint = {
  date: string
  value: number
  unit: string
  status: string
  advice: string
  isForecast: boolean
  dataSource: 'derived'
  confidence: 'low' | 'medium'
  horizonDays?: number
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
// วันพรุ่งนี้ถึงวันที่ N ข้างหน้า ตามเขตเวลา Asia/Bangkok
const bangkokDateKey = (offsetDays: number) => new Date(Date.now() + BANGKOK_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// น้ำหนัก blend ต่อ horizon เลือกจาก rolling-origin CV (data/vertex/round4_pm5_push.json):
//  - h=1 (24 ชม.): 0.7×ค่าล่าสุด + 0.3×MA7 — ชนะ CV @±3 (Phase 34) และ ±5 (68.9%)
//  - h=2-3 (48-72 ชม.): 0.5×ค่าล่าสุด + 0.5×MA7 — ±5 เพิ่มเป็น 57.1/53.4% (ทั้งฤดู) และ 85.1/80.7% (holdout)
//    (ที่ 48-72 ชม. persistence ล้วนแพ้ blend อย่างต่อเนื่อง — ค่าล่าสุดเก่าเกินไปเมื่อพยากรณ์ไกลขึ้น)
export const FORECAST_MODEL_VERSION = 'baseline-pers-ma7blend-w05-v1'

export function forecastWeight(daysAhead: number): number {
  return daysAhead <= 1 ? 0.7 : 0.5
}

// Baseline แบบ "persistence เบลนด์ MA7" — น้ำหนักต่อ horizon ตาม FORECAST_MODEL_VERSION
// ประวัติการเลือก: สูตร MA3+trend แพ้ persistence ทุก horizon (เลิกใช้, PHASE2_BASELINES.md)
// ทำนายทั้ง 3 วันจาก origin เดียวกัน (วันข้อมูลล่าสุด) — ตรงตามสูตรที่วัดจริง ไม่มีการปรับเพิ่ม
// ข้อมูลจริง < 3 จุด → ไม่สร้างค่าพยากรณ์เลย (ห้ามเรียกค่าปลอมว่าเป็นข้อมูลจริง)
// isSensitive = กลุ่มเสี่ยง → คำแนะนำแต่ละวันเข้มขึ้นตามกลุ่มผู้ใช้
export function buildForecast(history: { date: string; pm25: number }[], days = 3, isSensitive = false): AirQualityForecastPoint[] {
  const source = history.filter((point) => Number.isFinite(point.pm25))
  if (source.length < 3) return []

  const last = source[source.length - 1].pm25
  const last7 = source.slice(-7).map((point) => point.pm25)
  const ma7 = last7.length === 7 ? last7.reduce((sum, value) => sum + value, 0) / 7 : last

  return Array.from({ length: days }, (_, index) => {
    const daysAhead = index + 1
    const value = Math.max(0, forecastWeight(daysAhead) * last + (1 - forecastWeight(daysAhead)) * ma7)
    const status = pm25Status(value, isSensitive)
    return {
      date: bangkokDateKey(daysAhead),
      value: Math.round(value * 10) / 10,
      unit: 'µg/m³',
      status: status?.status ?? 'คาดการณ์จากแนวโน้มย้อนหลัง',
      advice: status?.advice ?? 'ติดตามข้อมูลจริงเพิ่มเติม',
      isForecast: true,
      dataSource: 'derived' as const,
      confidence: source.length >= 7 ? ('medium' as const) : ('low' as const),
      horizonDays: daysAhead,
    }
  })
}
