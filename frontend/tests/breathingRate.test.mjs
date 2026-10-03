import test from 'node:test'
import assert from 'node:assert/strict'
import { computeBreathingRate, extractShoulderY, movingAverage } from '../src/utils/breathingRate.js'

// สังสายจำลอง: หายใจ f Hz 30 วินาที ที่ 30 fps — คืน [{t, y}] (แบนราบ = 0.5 + แอมพลิจูด × sin)
function simulate({ frequencyHz = 0.3, amplitude = 0.02, durationMs = 30000, fps = 30, noise = 0, seed = 42 } = {}) {
  const samples = []
  let state = seed
  const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648 - 0.5 }
  for (let i = 0; i <= (durationMs / 1000) * fps; i++) {
    const t = (i / fps) * 1000
    const y = 0.5 + amplitude * Math.sin((2 * Math.PI * frequencyHz * t) / 1000) + noise * rand()
    samples.push({ t, y })
  }
  return samples
}

test('clear rhythmic breathing at 18/min is counted correctly', () => {
  const { bpm, peaks } = computeBreathingRate(simulate({ frequencyHz: 0.3 }))
  assert.ok(peaks >= 8 && peaks <= 10, `peaks=${peaks}`)
  assert.ok(bpm >= 16 && bpm <= 20, `bpm=${bpm}`)
})

test('noisy signal still counts within a reasonable range', () => {
  const { bpm } = computeBreathingRate(simulate({ frequencyHz: 0.3, noise: 0.008 }))
  assert.ok(bpm >= 12 && bpm <= 26, `bpm=${bpm}`)
})

test('flat signal yields no reliable bpm (no peaks to count)', () => {
  const { bpm, peaks } = computeBreathingRate(simulate({ amplitude: 0, noise: 0 }))
  assert.equal(peaks, 0)
  // contract ใหม่: สัญญาณแบน = วัดไม่ได้ → bpm null (ไม่ใช่ 0 ซึ่งจะตีความเป็น "หายใจหยุด")
  assert.equal(bpm, null)
})

test('faster breathing (24/min) scores higher than slower (12/min)', () => {
  const fast = computeBreathingRate(simulate({ frequencyHz: 0.4 })).bpm
  const slow = computeBreathingRate(simulate({ frequencyHz: 0.2 })).bpm
  assert.ok(fast > slow, `fast=${fast} slow=${slow}`)
})

test('too few samples returns null bpm (ไม่สร้างค่าลอย ๆ)', () => {
  const { bpm } = computeBreathingRate([{ t: 0, y: 0.5 }, { t: 100, y: 0.6 }])
  assert.equal(bpm, null)
})

test('extractShoulderY averages both shoulders and respects visibility', () => {
  const makeLandmark = (y, visibility = 1) => ({ y, visibility })
  assert.equal(extractShoulderY([null, null, null, null, null, null, null, null, null, null, null, makeLandmark(0.3), makeLandmark(0.5)]), 0.4)
  assert.equal(extractShoulderY([null, null, null, null, null, null, null, null, null, null, null, makeLandmark(0.3, 0.2), makeLandmark(0.5)]), null)
  assert.equal(extractShoulderY([]), null)
})

test('movingAverage smooths a spike', () => {
  const smoothed = movingAverage([1, 1, 1, 10, 1, 1, 1], 5)
  assert.ok(smoothed[3] > 1 && smoothed[3] < 10, `spike softened to ${smoothed[3]}`)
})
