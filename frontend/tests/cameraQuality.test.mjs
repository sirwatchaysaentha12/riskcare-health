import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCameraFrame, isVideoFrameReady } from '../src/utils/cameraQuality.js'

const width = 32
const height = 24
const torso = Array.from({ length: 25 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
torso[11] = { x: 0.42, y: 0.32, visibility: 1 }
torso[12] = { x: 0.58, y: 0.32, visibility: 1 }
torso[23] = { x: 0.44, y: 0.68, visibility: 1 }
torso[24] = { x: 0.56, y: 0.68, visibility: 1 }

function frame({ dark = false, flat = false, inverted = false } = {}) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = ((y * width) + x) * 4
      const checker = (x + y) % 2 === 0
      const value = dark ? 10 : flat ? 128 : (checker !== inverted ? 220 : 40)
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }
  }
  return { data, width, height }
}

test('accepts a stable, lit frame with visible upper-torso landmarks', () => {
  const image = frame()
  const result = analyzeCameraFrame(image, torso)
  const stable = analyzeCameraFrame(image, torso, result.sampledFrame)
  assert.equal(stable.status, 'ready')
  assert.equal(stable.torsoVisible, true)
  assert.deepEqual(stable.issues, [])
})

test('flags low light and insufficient image detail', () => {
  const result = analyzeCameraFrame(frame({ dark: true, flat: true }), torso)
  assert.ok(result.issues.some((issue) => issue.includes('มืด')))
  assert.ok(result.issues.some((issue) => issue.includes('เบลอ')))
  assert.equal(result.status, 'warning')
})

test('flags rapid frame changes and torso landmarks outside the frame', () => {
  const previous = analyzeCameraFrame(frame(), torso).sampledFrame
  const croppedTorso = torso.map((point) => ({ ...point }))
  croppedTorso[24] = { x: 1.1, y: 0.7, visibility: 1 }
  const result = analyzeCameraFrame(frame({ inverted: true }), croppedTorso, previous)
  assert.ok(result.issues.some((issue) => issue.includes('เปลี่ยนเร็ว')))
  assert.equal(result.torsoVisible, false)
  assert.ok(result.issues.some((issue) => issue.includes('ลำตัว')))
})

test('flags a narrow shoulder projection as a side-facing pose', () => {
  const sideFacing = torso.map((point) => ({ ...point }))
  sideFacing[11] = { x: 0.48, y: 0.32, visibility: 1 }
  sideFacing[12] = { x: 0.52, y: 0.32, visibility: 1 }
  const result = analyzeCameraFrame(frame(), sideFacing)
  assert.equal(result.turnedSideways, true)
  assert.ok(result.issues.some((issue) => issue.includes('หันข้าง')))
  assert.equal(result.status, 'warning')
})

test('provides an approximate framing distance hint from shoulder span', () => {
  const far = torso.map((point) => ({ ...point }))
  far[11] = { x: 0.455, y: 0.32, visibility: 1 }
  far[12] = { x: 0.545, y: 0.32, visibility: 1 }
  const near = torso.map((point) => ({ ...point }))
  near[11] = { x: 0.24, y: 0.32, visibility: 1 }
  near[12] = { x: 0.76, y: 0.32, visibility: 1 }
  assert.equal(analyzeCameraFrame(frame(), far).distanceStatus, 'too_far')
  assert.equal(analyzeCameraFrame(frame(), near).distanceStatus, 'too_close')
  assert.equal(analyzeCameraFrame(frame(), torso).distanceStatus, 'optimal')
})

test('flags partially obscured or untracked torso landmarks', () => {
  const obscured = torso.map((point) => ({ ...point }))
  obscured[23] = { x: 0.44, y: 0.68, visibility: 0.1 }
  const result = analyzeCameraFrame(frame(), obscured)
  assert.equal(result.torsoPartiallyObscured, true)
  assert.ok(result.issues.some((issue) => issue.includes('ถูกบัง')))
})

test('returns checking state for unavailable frame data', () => {
  assert.equal(analyzeCameraFrame(null, null).status, 'checking')
})

test('requires a decoded frame with real dimensions before video is ready', () => {
  assert.equal(isVideoFrameReady(null), false)
  assert.equal(isVideoFrameReady({ readyState: 1, videoWidth: 640, videoHeight: 480 }), false)
  assert.equal(isVideoFrameReady({ readyState: 2, videoWidth: 0, videoHeight: 480 }), false)
  assert.equal(isVideoFrameReady({ readyState: 2, videoWidth: 640, videoHeight: 480 }), true)
})
