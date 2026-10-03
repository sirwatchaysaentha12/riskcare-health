// ทดสอบ computeBreathingRate ด้วยสัญญาณสังเคราะห์ — v1.0 · 1 ต.ค. 2026
// 0.2 Hz = 12 BPM, 0.3 Hz = 18 BPM, noisy, แบนราบ — รายงานความคลาดเคลื่อนจริงใน output
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeBreathingRate } from '../src/utils/breathingRate.js'

const SAMPLE_INTERVAL_MS = 33 // ~30 fps เท่ากับกล้องจริง
const DURATION_MS = 30000

function makeSamples(breathHz, { noiseAmplitude = 0, seed = 42, baseline = 100, amplitude = 5 } = {}) {
  let state = seed
  const random = () => {
    // LCG ค่าคงที่ — เทสต์ต้องทำซ้ำได้
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648 - 0.5
  }
  const samples = []
  for (let t = 0; t <= DURATION_MS; t += SAMPLE_INTERVAL_MS) {
    const sine = amplitude * Math.sin(2 * Math.PI * breathHz * (t / 1000))
    samples.push({ t, y: baseline + sine + (noiseAmplitude ? random() * 2 * noiseAmplitude : 0) })
  }
  return samples
}

test('sine 0.2 Hz → ควรได้ ~12 BPM (±2)', () => {
  const { bpm } = computeBreathingRate(makeSamples(0.2))
  assert.ok(bpm !== null, 'ต้องคำนวณได้ ไม่ใช่ null')
  const deviation = Math.abs(bpm - 12)
  assert.ok(deviation <= 2, `ได้ ${bpm} BPM คลาดเคลื่อน ${deviation} — เกิน ±2`)
})

test('sine 0.3 Hz → ควรได้ ~18 BPM (±2)', () => {
  const { bpm } = computeBreathingRate(makeSamples(0.3))
  assert.ok(bpm !== null, 'ต้องคำนวณได้ ไม่ใช่ null')
  const deviation = Math.abs(bpm - 18)
  assert.ok(deviation <= 2, `ได้ ${bpm} BPM คลาดเคลื่อน ${deviation} — เกิน ±2`)
})

test('sine 0.25 Hz + noise ±1.5 → ควรได้ ~15 BPM (±3)', () => {
  const { bpm } = computeBreathingRate(makeSamples(0.25, { noiseAmplitude: 1.5 }))
  assert.ok(bpm !== null, 'มี noise ก็ต้องคำนวณได้')
  const deviation = Math.abs(bpm - 15)
  assert.ok(deviation <= 3, `ได้ ${bpm} BPM คลาดเคลื่อน ${deviation} — เกิน ±3`)
})

test('สัญญาณแบนราบ → ต้องไม่ให้ค่าที่น่าเชื่อถือ (null หรือ < 6)', () => {
  const { bpm } = computeBreathingRate(makeSamples(0, { noiseAmplitude: 0.05 }))
  assert.ok(bpm === null || bpm < 6, `สัญญาณแบนควรวัดไม่ได้ แต่ได้ ${bpm}`)
})

test('samples น้อยกว่า 5 จุด → null', () => {
  const { bpm } = computeBreathingRate([{ t: 0, y: 100 }])
  assert.equal(bpm, null)
})
