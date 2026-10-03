import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeRespiratoryRisk,
  scoreRr,
  scoreSpo2,
  scoreHr,
  questionnaireRiskPoints,
  averageRr,
} from '../src/utils/respiratoryRiskScore.ts'

// ---------- Spec case 1: ปกติทุกด้าน → ความเสี่ยงต่ำ (0-2) ----------
test('ปกติทุกด้าน → คะแนนรวม 0, ความเสี่ยงต่ำ', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 16,
    spo2Percent: 98,
    hrBpm: 75,
    questionnaire: { score: 0, redFlag: false, exists: true },
  })
  assert.equal(result.totalScore, 0)
  assert.equal(result.level, 'low')
  assert.equal(result.levelLabel, 'ความเสี่ยงต่ำ')
  assert.equal(result.tone, 'green')
  assert.equal(result.critical, false)
  assert.deepEqual(result.usedSignalKeys.sort(), ['hr', 'questionnaire', 'rr', 'spo2'])
  assert.deepEqual(result.missingSignalKeys, [])
})

// ---------- Spec case 2: RR ผิดปกติอย่างเดียว ----------
test('RR สูง 21-24 อย่างเดียว → เฝ้าระวัง, คะแนน 1, ความเสี่ยงต่ำ', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 23,
    spo2Percent: 97,
    hrBpm: 80,
    questionnaire: { score: 0, redFlag: false, exists: true },
  })
  assert.equal(result.totalScore, 1)
  assert.equal(result.level, 'low')
  const rr = result.signals.find((s) => s.key === 'rr')
  assert.equal(rr.points, 1)
  assert.equal(rr.category, 'watch')
})

test('RR > 24 อย่างเดียว (28) → 3 คะแนน, ความเสี่ยงปานกลาง', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 28,
    spo2Percent: 98,
    hrBpm: 78,
    questionnaire: { score: 0, redFlag: false, exists: true },
  })
  assert.equal(result.totalScore, 3)
  assert.equal(result.level, 'moderate')
  assert.equal(result.levelLabel, 'ความเสี่ยงปานกลาง')
})

test('RR ต่ำกว่า 12 (10) → เฝ้าระวัง 1 คะแนน', () => {
  const rr = scoreRr(10)
  assert.equal(rr.points, 1)
  assert.equal(rr.category, 'watch')
})

// ---------- Spec case 3: SpO2 ต่ำ → เตือนทันทีไม่รอรวมคะแนน ----------
test('SpO2 < 90 (88%) อย่างเดียว → 5 คะแนน + critical เตือนทันที "ควรพบแพทย์"', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 16,
    spo2Percent: 88,
    hrBpm: 75,
    questionnaire: { score: 0, redFlag: false, exists: true },
  })
  // 5 + 0 + 0 + 0 = 5 (< 6) but critical must still force doctor level
  assert.equal(result.totalScore, 5)
  assert.equal(result.critical, true)
  assert.equal(result.level, 'doctor')
  assert.equal(result.levelLabel, 'ควรพบแพทย์')
  assert.equal(result.tone, 'red')
  assert.match(result.criticalReason, /SpO2/)
})

test('SpO2 90-94 (92%) → 2 คะแนน เฝ้าระวัง, ไม่ critical', () => {
  const s = scoreSpo2(92)
  assert.equal(s.points, 2)
  assert.equal(s.critical, false)
  assert.equal(s.category, 'watch')
})

// ---------- Spec case 4: ทุกด้านผิดปกติ → ต้องได้ "ควรพบแพทย์" ----------
test('ทุกด้านผิดปกติ → คะแนน >= 6 และต้องได้ "ควรพบแพทย์"', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 30,          // 3
    spo2Percent: 92,           // 2
    hrBpm: 120,                // 1
    questionnaire: { score: 12, redFlag: false, exists: true }, // 3
  })
  assert.equal(result.totalScore, 9)
  assert.equal(result.level, 'doctor')
  assert.equal(result.levelLabel, 'ควรพบแพทย์')
  assert.equal(result.tone, 'red')
})

test('คะแนนรวม 6 พอดี (ไม่มี critical) → ควรพบแพทย์', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 26,          // 3
    spo2Percent: 96,           // 0
    hrBpm: 105,                // 1
    questionnaire: { score: 7, redFlag: false, exists: true }, // 2
  })
  assert.equal(result.totalScore, 6)
  assert.equal(result.level, 'doctor')
})

// ---------- Fallback 1: ไม่มีกล้อง → ประเมินจาก Self-Observation อย่างเดียวได้ ----------
test('fallback: ไม่มีกล้อง/วิดีโอ ไม่มี vitallens → ใช้แบบประเมินอย่างเดียว ไม่ crash', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: null,
    rrFromVitals: null,
    spo2Percent: null,
    hrBpm: null,
    questionnaire: { score: 12, redFlag: false, exists: true },
  })
  assert.equal(result.totalScore, 3)
  assert.equal(result.level, 'moderate')
  assert.deepEqual(result.usedSignalKeys, ['questionnaire'])
  assert.deepEqual(result.missingSignalKeys.sort(), ['hr', 'rr', 'spo2'])
  // และต้องรู้ตัวว่าขาดสัญญาณไหน
  const rr = result.signals.find((s) => s.key === 'rr')
  assert.equal(rr.category, 'unavailable')
})

test('fallback: ไม่มีทั้งหมด (แบบประเมิน 0) → ความเสี่ยงต่ำ แต่ระบุสัญญาณขาดครบ', () => {
  const result = computeRespiratoryRisk({ questionnaire: null })
  assert.equal(result.totalScore, 0)
  assert.equal(result.level, 'low')
  assert.deepEqual(result.usedSignalKeys, [])
  assert.equal(result.missingSignalKeys.length, 4)
})

// ---------- Fallback 2: vitallens ล้มเหลว → ใช้ MediaPipe RR + questionnaire แทน ----------
test('fallback: vitallens ล้มเหลว → RR จาก MediaPipe + questionnaire ยังประเมินได้', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 22,
    spo2Percent: null,
    hrBpm: null,
    questionnaire: { score: 6, redFlag: false, exists: true },
  })
  assert.equal(result.totalScore, 3) // RR watch 1 + questionnaire moderate 2
  assert.equal(result.level, 'moderate')
  assert.deepEqual(result.usedSignalKeys.sort(), ['questionnaire', 'rr'])
  assert.deepEqual(result.missingSignalKeys.sort(), ['hr', 'spo2'])
})

// ---------- สัญญาณรวม + กรณีเสริม ----------
test('averageRr: เฉลี่ยเฉพาะเมื่อมีทั้งคู่', () => {
  assert.equal(averageRr(16, 18), 17)
  assert.equal(averageRr(16, null), 16)
  assert.equal(averageRr(null, 18), 18)
  assert.equal(averageRr(null, null), null)
  assert.equal(averageRr(0, 18), 18) // 0 = ค่าไม่ถูกต้อง
  assert.equal(averageRr(Number.NaN, 18), 18)
})

test('red flag จากแบบประเมินเดิม → critical บังคับระดับควรพบแพทย์', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: 16,
    spo2Percent: null,
    hrBpm: null,
    questionnaire: { score: 2, redFlag: true, exists: true },
  })
  assert.equal(result.critical, true)
  assert.equal(result.level, 'doctor')
  assert.match(result.criticalReason, /red flag/)
})

test('questionnaireRiskPoints ใช้เกณฑ์เดิม 5/10/16', () => {
  assert.equal(questionnaireRiskPoints({ score: 0, exists: true }).points, 0)
  assert.equal(questionnaireRiskPoints({ score: 4, exists: true }).points, 1)
  assert.equal(questionnaireRiskPoints({ score: 5, exists: true }).points, 2)
  assert.equal(questionnaireRiskPoints({ score: 10, exists: true }).points, 3)
  assert.equal(questionnaireRiskPoints({ score: 16, exists: true }).points, 4)
  assert.equal(questionnaireRiskPoints({ score: 31, exists: true }).points, 4)
  assert.equal(questionnaireRiskPoints(null).category, 'unavailable')
})

test('ค่าผิดปกติ (NaN, ติดลบ, เกินช่วง) ไม่ทำให้ crash', () => {
  const result = computeRespiratoryRisk({
    rrFromCamera: Number.NaN,
    spo2Percent: -5,
    hrBpm: 999,
    questionnaire: { score: Number.NaN, redFlag: false, exists: true },
  })
  // hr 999 = นอกช่วง 60-100 → 1 คะแนน; ที่เหลือ unavailable
  assert.equal(result.totalScore, 1)
  assert.equal(Number.isFinite(result.totalScore), true)
})
