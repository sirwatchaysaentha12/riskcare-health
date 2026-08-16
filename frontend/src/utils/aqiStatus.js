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

export { AQI_RANGES }
