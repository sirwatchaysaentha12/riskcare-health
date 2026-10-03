import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bandpassFilter,
  computeRR,
  computeSignalQuality,
  detectApneaHypopnea,
  detectBreaths,
} from '../src/utils/respiratorySignal.js'

function sine(frequencyHz, durationSec = 60, fs = 20) {
  return Array.from({ length: durationSec * fs + 1 }, (_, index) =>
    Math.sin((2 * Math.PI * frequencyHz * index) / fs))
}

function seededNoise(length, seed = 73) {
  let state = seed
  return Array.from({ length }, () => {
    state = (1664525 * state + 1013904223) >>> 0
    return (state / 0x100000000) * 2 - 1
  })
}

test('0.25 Hz sinusoid estimates approximately 15 breaths per minute', () => {
  const fs = 20
  const filtered = bandpassFilter(sine(0.25, 60, fs), fs)
  const breaths = detectBreaths(filtered, fs)
  const result = computeRR(breaths, 60)
  assert.ok(result.rrMean !== null, 'RR should be available')
  assert.ok(Math.abs(result.rrMean - 15) <= 0.5, `rrMean=${result.rrMean}`)
})

test('0.5 Hz sinusoid estimates approximately 30 breaths per minute', () => {
  const fs = 20
  const filtered = bandpassFilter(sine(0.5, 60, fs), fs)
  const breaths = detectBreaths(filtered, fs)
  const result = computeRR(breaths, 60)
  assert.ok(result.rrMean !== null, 'RR should be available')
  assert.ok(Math.abs(result.rrMean - 30) <= 1, `rrMean=${result.rrMean}`)
})

test('noise-only signal has low signal quality', () => {
  const fs = 20
  const quality = computeSignalQuality(seededNoise(60 * fs), fs, [])
  assert.ok(quality !== null && quality < 0.3, `quality=${quality}`)
})

test('a 12-second still segment is reported as a candidate low-motion pause', () => {
  const fs = 10
  const signal = Array.from({ length: 60 * fs }, (_, index) => {
    const time = index / fs
    return time >= 20 && time < 32 ? 0 : Math.sin(2 * Math.PI * 0.25 * time)
  })
  const result = detectApneaHypopnea(signal, fs, [])
  assert.ok(result.apneaCount !== null && result.apneaCount >= 1, `apneaCount=${result.apneaCount}`)
})

test('invalid frequency settings return unavailable samples, not fabricated values', () => {
  assert.deepEqual(bandpassFilter([1, 2, 3], 1), [null, null, null])
  assert.deepEqual(computeRR([], 60), { rrMean: null, rrStd: null, rrMin: null, rrMax: null })
})
