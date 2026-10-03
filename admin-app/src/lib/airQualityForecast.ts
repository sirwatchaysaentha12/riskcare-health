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
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
// วันพรุ่งนี้ถึงวันที่ N ข้างหน้า ตามเขตเวลา Asia/Bangkok
const bangkokDateKey = (offsetDays: number) => new Date(Date.now() + BANGKOK_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Baseline แบบ "persistence เบลนด์ MA7": 0.7 × ค่าล่าสุด + 0.3 × ค่าเฉลี่ย 7 วันล่าสุด
// (modelVersion: baseline-pers-ma7blend-v1)
// เลือกจากการวัดจริงบน holdout 2026-07-01→09-30 (data/vertex/PHASE2_BASELINES.md):
//  - h=1 MAE 1.99 (±5 = 94%) — ดีกว่า MA3+trend เดิม (2.55) และเสมอ/ดีกว่า persistence ธรรมดาทุก horizon
//  - สูตรเดิม (MA3+trend) แพ้ persistence ทุก horizon จึงเลิกใช้
// ทำนายทั้ง 3 วันจาก origin เดียวกัน (วันข้อมูลล่าสุด) — ตรงตามสูตรที่วัดบน holdout ไม่มีการปรับเพิ่ม
// ข้อมูลจริง < 3 จุด → ไม่สร้างค่าพยากรณ์เลย (ห้ามเรียกค่าปลอมว่าเป็นข้อมูลจริง)
// isSensitive = กลุ่มเสี่ยง → คำแนะนำแต่ละวันเข้มขึ้นตามกลุ่มผู้ใช้
export function buildForecast(history: { date: string; pm25: number }[], days = 3, isSensitive = false): AirQualityForecastPoint[] {
  const source = history.filter((point) => Number.isFinite(point.pm25))
  if (source.length < 3) return []

  const last = source[source.length - 1].pm25
  const last7 = source.slice(-7).map((point) => point.pm25)
  const ma7 = last7.length === 7 ? last7.reduce((sum, value) => sum + value, 0) / 7 : last
  const value = Math.max(0, 0.7 * last + 0.3 * ma7)

  return Array.from({ length: days }, (_, index) => {
    const daysAhead = index + 1
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
    }
  })
}
