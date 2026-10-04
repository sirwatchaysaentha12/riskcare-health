import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAgreementMetrics,
  computeTestRetestRepeatability,
  computeClassificationMetrics,
  splitByParticipant,
  assertNoParticipantLeakage,
} from '../src/utils/validationMetrics.js'

// ---------- Exact match ----------
test('Exact match (measured == reference ทุกคู่) → MAE 0, RMSE 0, Bias 0', () => {
  const pairs = Array.from({ length: 30 }, (_, i) => ({
    participantId: `p${i}`,
    outcome: 'ok',
    reference: 15 + (i % 3),
    measured: 15 + (i % 3),
  }))
  const m = computeAgreementMetrics(pairs, { unit: 'ครั้ง/นาที', acceptableError: 2 })
  assert.equal(m.computed, true)
  assert.equal(m.mae, 0)
  assert.equal(m.rmse, 0)
  assert.equal(m.meanBias, 0)
  assert.equal(m.acceptableErrorPct, 1)
  assert.equal(m.nUsed, 30)
  assert.equal(m.exploratory, false)
})

// ---------- Bias คงที่ ----------
test('Bias คงที่ (+5 ทุกคู่) → meanBias 5, MAE 5, LoA กว้าง 0 (sd=0)', () => {
  const pairs = Array.from({ length: 12 }, (_, i) => ({
    participantId: `p${i}`,
    outcome: 'ok',
    reference: 70 + i,
    measured: 75 + i,
  }))
  const m = computeAgreementMetrics(pairs, { unit: 'bpm', acceptableError: 5 })
  assert.equal(m.meanBias, 5)
  assert.equal(m.mae, 5)
  assert.equal(m.blandAltman.limitsOfAgreement[0], 5) // sd = 0 → LoA = bias
  assert.equal(m.blandAltman.limitsOfAgreement[1], 5)
  assert.equal(m.acceptableErrorPct, 1) // error พอดี 5 ≤ 5
  assert.ok(m.confidenceInterval.meanBias95[0] <= 5 && m.confidenceInterval.meanBias95[1] >= 5)
})

// ---------- Missing value ----------
test('Missing reference → ถูก exclude และรายงานจำนวนจริง (ไม่เดาค่า)', () => {
  const pairs = [
    { participantId: 'p0', outcome: 'ok', reference: 16, measured: 17 },
    { participantId: 'p1', outcome: 'ok', reference: null, measured: 18 },
    { participantId: 'p2', outcome: 'ok', reference: 20, measured: null },
    { participantId: 'p3', outcome: 'failed', reference: 19, measured: null },
    { participantId: 'p4', outcome: 'abstained', reference: 18, measured: null },
  ]
  const m = computeAgreementMetrics(pairs, { unit: 'ครั้ง/นาที', acceptableError: 2 })
  assert.equal(m.computed, true)
  assert.equal(m.n, 5)
  assert.equal(m.nUsed, 1) // เฉพาะ p0
  assert.equal(m.nMissingReference, 1)
  assert.equal(m.nFailed, 1)
  assert.equal(m.nAbstained, 1)
  assert.equal(m.failureRate, 0.2)
  assert.equal(m.abstentionRate, 0.2)
})

// ---------- All missing ----------
test('All missing → computed:false พร้อมเหตุผล ห้ามส่งตัวเลข', () => {
  const allMissing = Array.from({ length: 5 }, (_, i) => ({
    participantId: `p${i}`, outcome: 'ok', reference: null, measured: null,
  }))
  const m = computeAgreementMetrics(allMissing, { unit: 'bpm', acceptableError: 5 })
  assert.equal(m.computed, false)
  assert.match(m.reason, /all missing/)
  assert.equal(m.mae, undefined)

  const empty = computeAgreementMetrics([], { unit: 'bpm', acceptableError: 5 })
  assert.equal(empty.computed, false)
  assert.match(empty.reason, /empty dataset/)
})

// ---------- Duplicate participant ----------
test('Duplicate participant ใน split เดียวกัน = ปกติ แต่ข้าม split = throw (leakage)', () => {
  const records = [
    { participantId: 'p0' }, { participantId: 'p0' }, // คนเดียวกันหลายเรคคอร์ดใน split เดียว OK
    { participantId: 'p1' }, { participantId: 'p2' },
  ]
  assert.doesNotThrow(() => assertNoParticipantLeakage({ train: records, test: [] }))
  assert.throws(
    () => assertNoParticipantLeakage({ train: [{ participantId: 'p0' }], test: [{ participantId: 'p0' }] }),
    /participant leakage/,
  )
})

// ---------- Invalid unit ----------
test('Invalid unit (ไม่ระบุ/ค่าว่าง) → throw', () => {
  const pairs = [{ participantId: 'p0', outcome: 'ok', reference: 16, measured: 16 }]
  assert.throws(() => computeAgreementMetrics(pairs, { acceptableError: 2 }), /invalid unit/)
  assert.throws(() => computeAgreementMetrics(pairs, { unit: '  ', acceptableError: 2 }), /invalid unit/)
  assert.throws(() => computeTestRetestRepeatability([], {}), /invalid unit/)
})

// ---------- Sampling interval ไม่เท่ากัน ----------
test('Test-retest: interval ไม่เท่ากันเกิน ±10% → ไม่คำนวณ พร้อมเหตุผล', () => {
  const even = [
    { participantId: 'p0', first: 16, second: 17, intervalMs: 120000 },
    { participantId: 'p1', first: 18, second: 18, intervalMs: 121000 },
  ]
  const ok = computeTestRetestRepeatability(even, { unit: 'ครั้ง/นาที', expectedIntervalMs: 120000 })
  assert.equal(ok.computed, true)
  assert.ok(ok.repeatabilityCoefficient >= 0)

  const uneven = [...even, { participantId: 'p2', first: 15, second: 21, intervalMs: 400000 }]
  const bad = computeTestRetestRepeatability(uneven, { unit: 'ครั้ง/นาที', expectedIntervalMs: 120000 })
  assert.equal(bad.computed, false)
  assert.match(bad.reason, /unequal sampling intervals/)
})

test('Test-retest: ไม่มี interval เลย → ไม่คำนวณ; คู่ไม่สมบูรณ์ถูก exclude และรายงาน', () => {
  const noInterval = computeTestRetestRepeatability(
    [{ participantId: 'p0', first: 16, second: 17 }], { unit: 'bpm' },
  )
  assert.equal(noInterval.computed, false)
  assert.match(noInterval.reason, /missing intervals/)

  const partial = computeTestRetestRepeatability(
    [
      { participantId: 'p0', first: 16, second: 17, intervalMs: 120000 },
      { participantId: 'p1', first: null, second: 18, intervalMs: 120000 },
    ], { unit: 'bpm' },
  )
  assert.equal(partial.computed, true)
  assert.equal(partial.n, 2)
  assert.equal(partial.nUsed, 1)
  assert.equal(partial.nExcluded, 1)
})

// ---------- One-class classification ----------
test('One-class (มีแต่ negative) → sensitivity/PPV = null + warning ไม่ปลอมผล', () => {
  const records = Array.from({ length: 6 }, (_, i) => ({
    participantId: `p${i}`, predicted: false, reference: false,
  }))
  const m = computeClassificationMetrics(records)
  assert.equal(m.computed, true)
  assert.equal(m.confusionMatrix.tn, 6)
  assert.equal(m.sensitivity, null)
  assert.equal(m.ppv, null)
  assert.match(m.oneClassWarning, /class เดียว/)
})

test('Classification ปกติ: confusion matrix + sens/spec/PPV/NPV ถูกต้อง', () => {
  const records = [
    { participantId: 'p0', predicted: true, reference: true },
    { participantId: 'p1', predicted: true, reference: false },
    { participantId: 'p2', predicted: false, reference: true },
    { participantId: 'p3', predicted: false, reference: false },
    { participantId: 'p4', predicted: true, reference: true },
  ]
  const m = computeClassificationMetrics(records)
  assert.deepEqual(m.confusionMatrix, { tp: 2, fp: 1, tn: 1, fn: 1 })
  assert.ok(Math.abs(m.sensitivity - 2 / 3) < 0.001)
  assert.equal(m.specificity, 0.5)
  assert.ok(Math.abs(m.ppv - 2 / 3) < 0.001)
  assert.equal(m.npv, 0.5)
})

test('ROC-AUC/Brier เฉพาะเมื่อมี probability ครบ; ไม่มี = ไม่คำนวณ', () => {
  const withProb = [
    { participantId: 'p0', predicted: true, reference: true, predictedProbability: 0.9 },
    { participantId: 'p1', predicted: false, reference: false, predictedProbability: 0.1 },
    { participantId: 'p2', predicted: true, reference: true, predictedProbability: 0.8 },
    { participantId: 'p3', predicted: false, reference: false, predictedProbability: 0.2 },
  ]
  const m = computeClassificationMetrics(withProb)
  assert.equal(m.rocAuc, 1)
  assert.ok(m.brierScore < 0.05)

  const noProb = [
    { participantId: 'p0', predicted: true, reference: true },
    { participantId: 'p1', predicted: false, reference: false },
  ]
  assert.equal(computeClassificationMetrics(noProb).rocAuc, undefined)
})

// ---------- Leakage จาก Participant เดียวกัน ----------
test('splitByParticipant: แบ่งตามบุคคล — คนเดียวกันไม่ข้าม split; คนน้อยกว่า 3 = throw', () => {
  const records = []
  for (let p = 0; p < 10; p++) {
    for (let repeat = 0; repeat < 3; repeat++) {
      records.push({ participantId: `p${p}`, reference: 16, measured: 17 })
    }
  }
  const result = splitByParticipant(records, { trainRatio: 0.6, validationRatio: 0.2, seed: 7 })
  const trainIds = new Set(result.splits.train.map((record) => record.participantId))
  const testIds = new Set(result.splits.test.map((record) => record.participantId))
  const valIds = new Set(result.splits.validation.map((record) => record.participantId))
  for (const id of trainIds) {
    assert.ok(!testIds.has(id) && !valIds.has(id), `${id} รั่วข้าม split`)
  }
  assert.equal(result.participantCounts.train + result.participantCounts.validation + result.participantCounts.test, 10)
  // 30 เรคคอร์ด = 10 คน × 3 ครั้ง ต้องครบทุก split
  assert.equal(result.recordCounts.train + result.recordCounts.validation + result.recordCounts.test, 30)

  assert.throws(() => splitByParticipant([{ participantId: 'only1' }], {}), /น้อยกว่า 3 คน/)
  assert.throws(() => splitByParticipant([], {}), /empty dataset/)
})

// ---------- Exploratory flag ----------
test('Dataset น้อยกว่า 30 → exploratory = true (Unstable Estimate)', () => {
  const pairs = Array.from({ length: 10 }, (_, i) => ({
    participantId: `p${i}`, outcome: 'ok', reference: 16, measured: 17,
  }))
  const m = computeAgreementMetrics(pairs, { unit: 'bpm', acceptableError: 2 })
  assert.equal(m.exploratory, true)
  assert.match(m.exploratoryNote, /Exploratory/)
})

// ---------- ห้ามใช้ correlation เป็น accuracy ----------
test('Framework ไม่มี correlation เป็นเมตริก accuracy (guard โครงสร้าง)', () => {
  const pairs = [{ participantId: 'p0', outcome: 'ok', reference: 16, measured: 17 }]
  const m = computeAgreementMetrics(pairs, { unit: 'bpm', acceptableError: 2 })
  assert.ok(!('correlation' in m) && !('pearson' in m), 'ห้ามมี correlation field')
})
