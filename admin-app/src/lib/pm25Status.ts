// Pure PM2.5 status/advice helper — Thai PCD 2566 thresholds, identical values to
// frontend/src/data/pm25Thresholds.js. No imports so `node --test` can run standalone.
// Citation: กรมควบคุมมลพิษ พ.ศ. 2566 — https://www.pcd.go.th/pcd_news/30028/
// กลุ่มเสี่ยง (isSensitive) = ตามนิยาม EPA sensitive group ที่ resech_data.md บันทึกไว้
export type Pm25StatusResult = { level: string; status: string; advice: string }

const THAI_2566_TIERS: { min: number; max: number | null; level: string; advice: string; sensitiveAdvice: string }[] = [
  { min: 0, max: 15, level: 'ดีมาก', advice: 'ทำกิจกรรมกลางแจ้งได้ตามปกติ', sensitiveAdvice: 'ทำกิจกรรมกลางแจ้งได้ตามปกติ — กลุ่มเสี่ยงควรพกยา/อุปกรณ์ติดตัวตามคำแนะนำแพทย์' },
  { min: 15.1, max: 25, level: 'ดี', advice: 'ทำกิจกรรมได้ตามปกติ และสังเกตอาการผิดปกติ', sensitiveAdvice: 'ทำกิจกรรมได้ตามปกติ — กลุ่มเสี่ยงควรเฝ้าระวังอาการใกล้ชิดและพกยาประจำตัว' },
  { min: 25.1, max: 37.5, level: 'ปานกลาง', advice: 'ลดกิจกรรมกลางแจ้งที่ใช้แรงมาก', sensitiveAdvice: 'กลุ่มเสี่ยงควรลดกิจกรรมกลางแจ้งที่ใช้แรงมาก และเตรียมยา/อุปกรณ์ติดตัว' },
  { min: 37.6, max: 75, level: 'เริ่มมีผลกระทบต่อสุขภาพ', advice: 'ลด/เลี่ยงกิจกรรมกลางแจ้ง และสวมหน้ากากป้องกัน PM2.5', sensitiveAdvice: 'กลุ่มเสี่ยงควรเลี่ยงกิจกรรมกลางแจ้ง สวมหน้ากากป้องกัน PM2.5 และเฝ้าระวังอาการใกล้ชิด' },
  { min: 75.1, max: null, level: 'มีผลกระทบต่อสุขภาพ', advice: 'งดกิจกรรมกลางแจ้ง และหากมีอาการผิดปกติรีบพบแพทย์', sensitiveAdvice: 'กลุ่มเสี่ยงต้องอยู่ในพื้นที่ปลอดภัย เตรียมยา/อุปกรณ์พร้อมใช้ และหากมีอาการรีบพบแพทย์' },
]

export function pm25Status(value: number, isSensitive = false): Pm25StatusResult | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  const tier = THAI_2566_TIERS.find((entry) => numeric >= entry.min && (entry.max === null || numeric <= entry.max))
  return tier ? { level: tier.level, status: tier.level, advice: isSensitive ? tier.sensitiveAdvice : tier.advice } : null
}
