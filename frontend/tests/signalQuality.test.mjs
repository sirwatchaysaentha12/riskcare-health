import test from 'node:test'
import assert from 'node:assert/strict'
import {
  QUALITY_THRESHOLDS,
  QUALITY_STATUS,
  CLINICAL_ACCURACY_STATUS,
  computeFrameMetrics,
  createQualityAccumulator,
  recordFrameMetrics,
  recordPoseFrame,
  computeIntervalCv,
  buildQualityResult,
  assessHrQuality,
} from '../src/utils/signalQuality.js'

const W = 64
const H = 48
function makeImageData(fill) {
  const data = new Uint8ClampedArray(W * H * 4)
  if (typeof fill === 'number') {
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = fill; data[i * 4 + 1] = fill; data[i * 4 + 2] = fill; data[i * 4 + 3] = 255
    }
  } else {
    for (let i = 0; i < W * H; i++) {
      // checkerboard 4px — คมชัดสูง
      const x = Math.floor((i % W) / 4)
      const y = Math.floor(Math.floor(i / W) / 4)
      const value = (x + y) % 2 ? 200 : 40
      data[i * 4] = value; data[i * 4 + 1] = value; data[i * 4 + 2] = value; data[i * 4 + 3] = 255
    }
  }
  return { data, width: W, height: H }
}

// ---------- computeFrameMetrics ----------
test('computeFrameMetrics: ภาพเทากลาง = ความสว่าง ~128, เบลอ (edge=0)', () => {
  const m = computeFrameMetrics(makeImageData(128))
  assert.ok(Math.abs(m.brightness - 128) < 1)
  assert.equal(m.edgeDetail, 0) // ภาพเรียบล้วน = ไม่มีรายละเอียดขอบ = เบลอสุด
  assert.equal(m.frameChange, null) // ไม่มีเฟรมก่อน
})

test('computeFrameMetrics: checkerboard = คมชัดสูง (edgeDetail > BLUR_WARN)', () => {
  const m = computeFrameMetrics(makeImageData('checker'))
  assert.ok(m.edgeDetail > QUALITY_THRESHOLDS.BLUR_WARN, `edgeDetail=${m.edgeDetail}`)
})

test('computeFrameMetrics: frameChange วัดความต่างจากเฟรมก่อน', () => {
  const gray1 = computeFrameMetrics(makeImageData(60)).sampledFrame
  const m2 = computeFrameMetrics(makeImageData(200), gray1)
  assert.ok(m2.frameChange > 50, `frameChange=${m2.frameChange}`)
})

// ---------- accumulator ----------
test('recordFrameMetrics/recordPoseFrame: รวมสถิติถูกต้อง', () => {
  const acc = createQualityAccumulator()
  recordFrameMetrics(acc, { brightness: 100, edgeDetail: 8, frameChange: 10 })
  recordFrameMetrics(acc, { brightness: 140, edgeDetail: 10, frameChange: 30 })
  recordPoseFrame(acc, true)
  recordPoseFrame(acc, false)
  assert.equal(acc.brightness.length, 2)
  assert.equal(acc.poseFramesProcessed, 2)
  assert.equal(acc.poseFramesVisible, 1)
})

// ---------- computeIntervalCv ----------
test('computeIntervalCv: peaks สม่ำเสมอ → CV ต่ำ, แปรปรวน → CV สูง, <2 peaks → null', () => {
  const regular = [0, 2000, 4000, 6000, 8000]
  const irregular = [0, 1000, 5000, 6100, 11000]
  const cvRegular = computeIntervalCv(regular)
  const cvIrregular = computeIntervalCv(irregular)
  assert.ok(cvRegular < 0.1)
  assert.ok(cvIrregular > 0.3)
  assert.equal(computeIntervalCv([1000]), null)
  assert.equal(computeIntervalCv([]), null)
})

// ---------- buildQualityResult ----------
function goodAccumulator() {
  const acc = createQualityAccumulator()
  // ตัวอย่าง 20 เฟรม: สว่าง 100-140, คมชัด 10-14, นิ่ง 5-12
  for (let i = 0; i < 20; i++) {
    recordFrameMetrics(acc, { brightness: 100 + (i % 5) * 8, edgeDetail: 10 + (i % 3), frameChange: 5 + (i % 4) })
    recordPoseFrame(acc, true)
  }
  return acc
}

function goodRrResult() {
  const peaks = []
  for (let t = 3000; t <= 27000; t += 2500) peaks.push(t) // ~24/min สม่ำเสมอ
  return { bpm: 24, peaks, spanMs: 24000, periodicity: 0.55 }
}

test('ทุกอย่างดี → qualityStatus good, canUseMeasurement true, missingReason null', () => {
  const q = buildQualityResult({
    accumulator: goodAccumulator(),
    elapsedMs: 30000,
    requiredMs: 30000,
    processedFrames: 500,
    rafFrames: 520,
    rrResult: goodRrResult(),
  })
  assert.equal(q.qualityStatus, QUALITY_STATUS.GOOD)
  assert.equal(q.canUseMeasurement, true)
  assert.equal(q.missingReason, null)
  assert.equal(q.retryGuidance, null)
  assert.deepEqual(q.qualityReasons, [])
  assert.equal(q.checks.length, 9)
  for (const c of q.checks) assert.equal(c.status, 'pass', `${c.id} = ${c.status}`)
  assert.equal(q.clinicalAccuracy, CLINICAL_ACCURACY_STATUS)
})

test('แสงน้อย (มืดเกิน 30% ของเวลา) → fail, canUse false, มี missingReason + retryGuidance', () => {
  const acc = createQualityAccumulator()
  for (let i = 0; i < 20; i++) {
    recordFrameMetrics(acc, { brightness: i % 2 ? 20 : 110, edgeDetail: 10, frameChange: 5 })
    recordPoseFrame(acc, true)
  }
  const q = buildQualityResult({ accumulator: acc, elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(q.canUseMeasurement, false)
  assert.equal(q.qualityStatus, QUALITY_STATUS.INSUFFICIENT)
  assert.ok(q.qualityReasons.some((r) => r.startsWith('brightness:fail')))
  assert.match(q.missingReason, /คุณภาพไม่ผ่าน/)
  assert.match(q.retryGuidance, /แสงไม่พอ/)
})

test('ภาพเบลอ (edgeDetail ต่ำ) → fail blur', () => {
  const acc = createQualityAccumulator()
  for (let i = 0; i < 20; i++) {
    recordFrameMetrics(acc, { brightness: 120, edgeDetail: 2, frameChange: 5 })
    recordPoseFrame(acc, true)
  }
  const q = buildQualityResult({ accumulator: acc, elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(q.canUseMeasurement, false)
  assert.ok(q.qualityReasons.includes('blur:fail'))
})

test('ขยับตัว/พูด/ไอมาก (frameChange สูง) → fail motion', () => {
  const acc = createQualityAccumulator()
  for (let i = 0; i < 20; i++) {
    recordFrameMetrics(acc, { brightness: 120, edgeDetail: 10, frameChange: 45 })
    recordPoseFrame(acc, true)
  }
  const q = buildQualityResult({ accumulator: acc, elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(q.canUseMeasurement, false)
  assert.ok(q.qualityReasons.includes('motion:fail'))
})

test('ไหล่หลุดเฟรมเกือบตลอด (<50%) → fail poseVisibility; 50-70% → warn ใช้ได้', () => {
  const acc = createQualityAccumulator()
  for (let i = 0; i < 20; i++) {
    recordFrameMetrics(acc, { brightness: 120, edgeDetail: 10, frameChange: 5 })
    recordPoseFrame(acc, i < 8) // 40%
  }
  const qFail = buildQualityResult({ accumulator: acc, elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(qFail.canUseMeasurement, false)
  assert.ok(qFail.qualityReasons.includes('poseVisibility:fail'))

  const acc2 = createQualityAccumulator()
  for (let i = 0; i < 20; i++) {
    recordFrameMetrics(acc2, { brightness: 120, edgeDetail: 10, frameChange: 5 })
    recordPoseFrame(acc2, i < 12) // 60% → warn
  }
  const qWarn = buildQualityResult({ accumulator: acc2, elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(qWarn.canUseMeasurement, true)
  assert.equal(qWarn.qualityStatus, QUALITY_STATUS.ACCEPTABLE)
})

test('FPS ต่ำ (<7) → fail; เฟรมหลุด >35% → fail', () => {
  const q = buildQualityResult({ accumulator: goodAccumulator(), elapsedMs: 30000, requiredMs: 30000, processedFrames: 150, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(q.canUseMeasurement, false)
  const fps = q.checks.find((c) => c.id === 'fps')
  const dropped = q.checks.find((c) => c.id === 'droppedFrames')
  assert.equal(fps.status, 'fail') // 5 fps
  assert.equal(dropped.status, 'fail') // ~71%
})

test('วัดสั้นกว่า 90% → fail duration', () => {
  const q = buildQualityResult({ accumulator: goodAccumulator(), elapsedMs: 20000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(q.canUseMeasurement, false)
  assert.ok(q.qualityReasons.includes('duration:fail'))
})

test('Periodicity ต่ำ (<0.25) → fail; 0.25-0.35 → warn', () => {
  const qFail = buildQualityResult({ accumulator: goodAccumulator(), elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: { bpm: null, peaks: [0, 900, 4000], spanMs: 4000, periodicity: 0.1 } })
  assert.ok(qFail.qualityReasons.includes('periodicity:fail'))
  assert.equal(qFail.canUseMeasurement, false)

  const qWarn = buildQualityResult({ accumulator: goodAccumulator(), elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: { bpm: 18, peaks: [0, 3300, 6600, 9900], spanMs: 9900, periodicity: 0.3 } })
  assert.equal(qWarn.canUseMeasurement, true)
  assert.ok(qWarn.qualityReasons.includes('periodicity:warn'))
})

test('Interval CV สูง (>0.8) → fail; 0.6-0.8 → warn', () => {
  const irregular = [0, 1200, 5200, 5900, 11000] // CV สูง
  const qFail = buildQualityResult({ accumulator: goodAccumulator(), elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: { bpm: 20, peaks: irregular, spanMs: 11000, periodicity: 0.5 } })
  const cv = qFail.checks.find((c) => c.id === 'intervalCv')
  assert.ok(['fail', 'warn'].includes(cv.status))
  // กับ peaks สม่ำเสมอ ต้อง pass
  const qOk = buildQualityResult({ accumulator: goodAccumulator(), elapsedMs: 30000, requiredMs: 30000, processedFrames: 500, rafFrames: 520, rrResult: goodRrResult() })
  assert.equal(qOk.checks.find((c) => c.id === 'intervalCv').status, 'pass')
})

test('ไม่มีข้อมูลเลย (ยกเลิกกลางทาง) → ห้ามใช้ค่า', () => {
  const q = buildQualityResult({ accumulator: createQualityAccumulator(), elapsedMs: 3000, requiredMs: 30000, processedFrames: 0, rafFrames: 5, rrResult: null })
  assert.equal(q.canUseMeasurement, false)
  assert.equal(q.qualityStatus, QUALITY_STATUS.INSUFFICIENT)
  assert.ok(q.retryGuidance)
})

// ---------- assessHrQuality ----------
test('HR: confidence สูง → usable, แยก confidence ออกจากคุณภาพ', () => {
  const r = assessHrQuality(78, 0.9)
  assert.equal(r.usable, true)
  assert.equal(r.level, 'ok')
  assert.equal(r.missingReason, null)
})

test('HR: confidence < 0.5 → ใช้ไม่ได้ (missing) ห้ามป้อน scoring', () => {
  const r = assessHrQuality(78, 0.3)
  assert.equal(r.usable, false)
  assert.equal(r.level, 'low_confidence')
  assert.match(r.missingReason, /Algorithm Confidence ต่ำ/)
})

test('HR: confidence 0.5-0.75 → usable แต่เตือน', () => {
  const r = assessHrQuality(78, 0.6)
  assert.equal(r.usable, true)
  assert.equal(r.level, 'low_confidence_warning')
})

test('HR: ไม่มีค่า → missing', () => {
  const r = assessHrQuality(null, null)
  assert.equal(r.usable, false)
  assert.match(r.missingReason, /ไม่ได้รับค่า HR/)
})

// ---------- guard สำคัญของ Phase 2 ----------
test('CLINICAL_ACCURACY_STATUS ต้องประกาศชัดว่ายังไม่ผ่านการตรวจสอบ', () => {
  assert.match(CLINICAL_ACCURACY_STATUS, /ยังไม่ได้รับการตรวจสอบ/)
})
