const AQI_RANGES = [
  { max: 50, label: 'ดี', tone: 'green', textColor: '#FFFFFF', background: '#10B981' },
  { max: 100, label: 'ปานกลาง', tone: 'lime', textColor: '#1E293B', background: '#A3E635' },
  { max: 150, label: 'กลุ่มเสี่ยงควรระวัง', tone: 'yellow', textColor: '#1E293B', background: '#FACC15' },
  { max: 200, label: 'มีผลกระทบ', tone: 'orange', textColor: '#FFFFFF', background: '#F97316' },
  { max: Infinity, label: 'อันตราย', tone: 'red', textColor: '#FFFFFF', background: '#EF4444' },
]

export function getAqiStatus(value) {
  const aqi = Number(value)
  if (!Number.isFinite(aqi)) return { label: 'รอข้อมูล', tone: 'pending', textColor: '#475569', background: '#E2E8F0' }
  return AQI_RANGES.find((range) => aqi <= range.max) || AQI_RANGES[AQI_RANGES.length - 1]
}

export function pm25ToAqi(value) {
  const pm25 = Number(value)
  if (!Number.isFinite(pm25) || pm25 < 0) return null
  const points = [[0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]]
  const [lowC, highC, lowI, highI] = points.find(([low, high]) => pm25 >= low && pm25 <= high) || points.at(-1)
  return Math.round(((highI - lowI) / (highC - lowC)) * (Math.min(pm25, highC) - lowC) + lowI)
}

// อิโมจิผูกกับ "ระดับความเสี่ยง" (ข้อความสถานะจาก backend ซึ่งคำนวณจาก PM2.5 เสมอ)
// ไม่ผูกกับหน่วยที่แสดง (PM2.5/AQI) — ทั้งสองโหมดจึงได้อิโมจิเดียวกันต่อวันเดียวกัน
const EMOJI_BY_STATUS_LABEL = {
  'ดีมาก': '\u{1F604}',
  'ดี': '\u{1F642}',
  'ปานกลาง': '\u{1F610}',
  'เริ่มมีผลกระทบต่อสุขภาพ': '\u{1F61F}',
  'มีผลกระทบต่อสุขภาพ': '\u{1F637}',
}

export function getEmojiByStatusLabel(statusLabel) {
  const key = String(statusLabel || '').trim()
  return EMOJI_BY_STATUS_LABEL[key] ?? '—'
}

export function getAqiEmoji(pm25Value) {
  const tone = getAqiStatus(pm25ToAqi(pm25Value)).tone
  if (tone === 'green') return '\u{1F642}'
  if (tone === 'lime' || tone === 'yellow') return '\u{1F610}'
  if (tone === 'orange' || tone === 'red') return '\u{1F641}'
  return '-'
}

export { AQI_RANGES }
