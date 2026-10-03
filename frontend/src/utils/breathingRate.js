// Pure breathing-signal analysis for the Webcam Breathing Rate Detector.
// No DOM/React imports — unit-testable with `node --test`.
// ฟีเจอร์ทดลอง: ใช้กับโมเดล pose detection สำเร็จรูป (MediaPipe) เท่านั้น ไม่ใช่ค่าทางการแพทย์

export const SHOULDER_LEFT = 11
export const SHOULDER_RIGHT = 12
export const MIN_SHOULDER_VISIBILITY = 0.5

// MediaPipe คืน landmarks normalized 0-1 — ไหล่ 2 จุดที่ visibility ต่ำให้ถือว่าอ่านไม่ได้
export function extractShoulderY(landmarks) {
  const left = landmarks?.[SHOULDER_LEFT]
  const right = landmarks?.[SHOULDER_RIGHT]
  if (!left || !right) return null
  if ((left.visibility ?? 1) < MIN_SHOULDER_VISIBILITY || (right.visibility ?? 1) < MIN_SHOULDER_VISIBILITY) return null
  return (left.y + right.y) / 2
}

export function movingAverage(values, window) {
  const size = Math.max(1, Math.floor(window))
  const out = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(size / 2))
    const end = Math.min(values.length, i + Math.ceil(size / 2))
    const slice = values.slice(start, end)
    out.push(slice.reduce((sum, value) => sum + value, 0) / slice.length)
  }
  return out
}

// ลบ baseline (แนวโน้มช้า เช่น ผู้ใช้ขยับตัว) ออกจากสัญญาณ
export function detrend(values, baselineWindow = 60) {
  const baseline = movingAverage(values, baselineWindow)
  return values.map((value, index) => value - baseline[index])
}

// นับ peak ด้วยแนวคิด prominence (peak ต้องโดดกว่าหุบเขาที่คั่นอย่างน้อย
// max(prominenceFactor × std, minProminence, 0.3 × prominence ของ peak ที่โดดที่สุด))
// — สัมพัทธ์กับ peak จริงที่โดดสุด ทำให้ noise จิ๋วบนสัญญาณแบน และ false peak จาก noise
// ไม่ถูกนับ โดยไม่ตัดคลื่นหายใจจริงที่ amplitude เล็ก + บังคับระยะห่างเวลาขั้นต่ำ
export function countPeaks(times, values, { minGapMs = 1500, prominenceFactor = 0.5, minProminence = 0 } = {}) {
  const n = values.length
  if (n < 3) return []
  const mean = values.reduce((sum, value) => sum + value, 0) / n
  const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n)
  if (std <= 0) return []

  const candidates = []
  for (let i = 1; i < n - 1; i++) {
    if (values[i] > values[i - 1] && values[i] >= values[i + 1]) {
      let leftValley = values[i]
      for (let j = i - 1; j >= 0; j--) {
        if (values[j] > values[i]) break
        leftValley = Math.min(leftValley, values[j])
      }
      let rightValley = values[i]
      for (let j = i + 1; j < n; j++) {
        if (values[j] > values[i]) break
        rightValley = Math.min(rightValley, values[j])
      }
      candidates.push({ index: i, prominence: values[i] - Math.max(leftValley, rightValley) })
    }
  }
  const maxProminence = candidates.reduce((max, candidate) => Math.max(max, candidate.prominence), 0)
  const prominenceFloor = Math.max(prominenceFactor * std, minProminence, 0.3 * maxProminence)
  const accepted = candidates
    .filter((candidate) => candidate.prominence >= prominenceFloor)
    .map((candidate) => candidate.index)

  const kept = []
  for (const index of accepted.sort((a, b) => times[a] - times[b])) {
    if (kept.length && times[index] - times[kept[kept.length - 1]] < minGapMs) continue
    kept.push(index)
  }
  return kept
}

// samples: [{ t: ms ตั้งแต่เริ่มวัด, y: ค่าสัญญาณดิบ }]
// คืน { bpm, peaks, spanMs } — bpm = จำนวน peak × (60000 / ช่วงเวลาจริงที่ใช้)
export function computeBreathingRate(samples, { minGapMs = 1500, prominenceFactor = 0.5 } = {}) {
  const valid = (Array.isArray(samples) ? samples : []).filter((sample) => sample && Number.isFinite(sample.t) && Number.isFinite(sample.y))
  if (valid.length < 5) return { bpm: null, peaks: 0, spanMs: 0, periodicity: 0 }
  const times = valid.map((sample) => sample.t)
  const smoothed = movingAverage(valid.map((sample) => sample.y), 5)
  const detrended = detrend(smoothed, 60)
  const peaks = countPeaks(times, detrended, { minGapMs, prominenceFactor })
  const spanMs = Math.max(times.at(-1) - times[0], 1000)
  // periodicity test (normalized autocorrelation ที่ lag 1.5–10 วินาที): สัญญาณหายใจจริงเป็นคาบซ้ำ
  // ค่าสูง (~>0.35) = มีคาบจริง · ค่าต่ำ = noise ล้วน (สัญญาณแบน + noise) → ไม่ให้ค่า bpm
  const sampleIntervalMs = spanMs / Math.max(detrended.length - 1, 1)
  const mean = detrended.reduce((sum, value) => sum + value, 0) / detrended.length
  const centered = detrended.map((value) => value - mean)
  const energy = centered.reduce((sum, value) => sum + value * value, 0)
  let periodicity = 0
  if (energy > 0) {
    const minLag = Math.max(1, Math.round(1500 / sampleIntervalMs))
    const maxLag = Math.min(detrended.length - 1, Math.round(10000 / sampleIntervalMs))
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0
      for (let i = lag; i < detrended.length; i++) sum += centered[i] * centered[i - lag]
      periodicity = Math.max(periodicity, sum / energy)
    }
  }
  // regularity gate ของช่วงห่าง peak (CV ≤ 0.6) + periodicity — ไม่ผ่าน = ไม่ให้ bpm (ไม่น่าเชื่อถือ)
  let bpm = null
  if (peaks.length >= 2 && periodicity >= 0.35) {
    const intervals = []
    for (let i = 1; i < peaks.length; i++) intervals.push(times[peaks[i]] - times[peaks[i - 1]])
    const meanInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    const intervalCv = meanInterval > 0
      ? Math.sqrt(intervals.reduce((sum, value) => sum + (value - meanInterval) ** 2, 0) / intervals.length) / meanInterval
      : 1
    if (intervalCv <= 0.6) bpm = Math.round((peaks.length * 60000) / spanMs)
  }
  return { bpm, peaks: peaks.length, spanMs, periodicity: Math.round(periodicity * 1000) / 1000 }
}
