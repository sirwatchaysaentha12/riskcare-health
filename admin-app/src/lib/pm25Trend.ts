// Pure helpers for the /api/pm25-history route. No Next.js imports here so
// unit tests can run standalone with `node --test`.
export type Pm25TrendPoint = { date: string; pm25: number }
export type Pm25Trend = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data'
export type Pm25TrendResult = {
  trend: Pm25Trend
  latestAvg: number | null
  previousAvg: number | null
  dataPointsUsed: number
}

// เปรียบเทียบค่าเฉลี่ย 3 จุดล่าสุด กับค่าเฉลี่ย 3 จุดก่อนหน้า
// ต่างกันเกิน 10% ถือว่าเปลี่ยนแปลงชัดเจน และต้องมีข้อมูลอย่างน้อย 6 จุดจึงจะพยากรณ์ได้
export function calculateTrend(historyData: Pm25TrendPoint[]): Pm25TrendResult {
  const points = (Array.isArray(historyData) ? historyData : [])
    .filter((point) => point && Number.isFinite(Number(point.pm25)))
    .map((point) => ({ date: String(point.date), pm25: Number(point.pm25) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (points.length < 6) {
    return { trend: 'insufficient_data', latestAvg: null, previousAvg: null, dataPointsUsed: points.length }
  }

  const window = points.slice(-6)
  const previousAvg = window.slice(0, 3).reduce((sum, point) => sum + point.pm25, 0) / 3
  const latestAvg = window.slice(3).reduce((sum, point) => sum + point.pm25, 0) / 3

  let trend: Pm25Trend
  if (previousAvg === 0) {
    trend = latestAvg > 0 ? 'increasing' : 'stable'
  } else {
    const changeRatio = (latestAvg - previousAvg) / previousAvg
    trend = changeRatio > 0.1 ? 'increasing' : changeRatio < -0.1 ? 'decreasing' : 'stable'
  }

  return { trend, latestAvg, previousAvg, dataPointsUsed: 6 }
}

// สร้างข้อความแจ้งเตือนจากผลแนวโน้มและกลุ่มความเสี่ยงของผู้ใช้
// userRiskProfile ใช้โครงสร้างเดียวกับผลลัพธ์ของ getPersonalizedAudience()
export function generateAlertMessage(trend: Pm25TrendResult, userRiskProfile?: { audience?: string } | null): string {
  const sensitive = userRiskProfile?.audience === 'sensitive'
  const avgText = trend.latestAvg !== null && trend.previousAvg !== null
    ? ` (เฉลี่ย 3 วันก่อนหน้า ${trend.previousAvg.toFixed(1)} → ล่าสุด ${trend.latestAvg.toFixed(1)} µg/m³)`
    : ''

  switch (trend.trend) {
    case 'insufficient_data':
      return 'ข้อมูลยังไม่เพียงพอสำหรับพยากรณ์แนวโน้มฝุ่น (ต้องมีอย่างน้อย 6 จุดวัน) — โปรดเข้าดูอีกครั้งเมื่อระบบเก็บข้อมูลครบถ้วนแล้ว'
    case 'increasing':
      return sensitive
        ? `แนวโน้มฝุ่น PM2.5 กำลังเพิ่มขึ้น${avgText} — กลุ่มเสี่ยงควรเตรียมยาพ่น/ยาประจำตัว ลดกิจกรรมกลางแจ้ง และเฝ้าระวังอาการทางเดินหายใจ`
        : `แนวโน้มฝุ่น PM2.5 กำลังเพิ่มขึ้น${avgText} — ควรตรวจสอบค่าฝุ่นก่อนออกกิจกรรมกลางแจ้ง`
    case 'decreasing':
      return sensitive
        ? `แนวโน้มฝุ่น PM2.5 ลดลง${avgText} — กลุ่มเสี่ยงยังควรระวังค่าสะสมและพกยาประจำตัวตามเดิม`
        : `แนวโน้มฝุ่น PM2.5 ลดลง${avgText} — สภาพอากาศกำลังดีขึ้น ทำกิจกรรมได้ตามปกติ`
    case 'stable':
      return sensitive
        ? `แนวโน้มฝุ่น PM2.5 คงที่${avgText} — กลุ่มเสี่ยงควรเฝ้าระวังอาการต่อเนื่องตามคำแนะนำที่ดูแลอยู่`
        : `แนวโน้มฝุ่น PM2.5 คงที่${avgText} — ทำกิจกรรมได้ตามปกติ`
  }
}
