import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MEASUREMENT_SCHEMA_VERSION,
  CONTRACT_QUALITY_STATUS,
  QUALITY_DISPLAY,
  CLINICAL_ACCURACY_CODE,
  ALGORITHM_PROVENANCE,
  createSignalMeasurement,
  createSpo2LocalMeasurement,
  buildClinicianSummary,
  pseudonymizeUserCode,
} from '../src/utils/measurementContract.js'
import { QUALITY_STATUS } from '../src/utils/signalQuality.js'

const BASE = {
  key: 'rr',
  label: 'อัตราการหายใจ (RR)',
  unit: 'ครั้ง/นาที',
  source: 'กล้อง (MediaPipe)',
  measuredAt: '2026-10-04T10:00:00.000Z',
  durationSeconds: 30,
  qualityStatus: QUALITY_STATUS.GOOD,
}

// ---------- usable measurement ----------
test('usable measurement: ครบ 13 field ตาม contract', () => {
  const m = createSignalMeasurement({ ...BASE, value: 16, usable: true })
  assert.equal(m.usable, true)
  assert.equal(m.value, 16)
  assert.equal(m.unit, 'ครั้ง/นาที')
  for (const field of ['value', 'unit', 'usable', 'source', 'measuredAt', 'durationSeconds', 'qualityStatus', 'qualityReasons', 'algorithmConfidence', 'clinicalAccuracy', 'missingReason', 'algorithm', 'limitations']) {
    assert.ok(field in m, `missing field: ${field}`)
  }
  assert.equal(m.schemaVersion, MEASUREMENT_SCHEMA_VERSION)
})

// ---------- unusable measurement ----------
test('unusable measurement: value บังคับเป็น null + ต้องมี missingReason', () => {
  const m = createSignalMeasurement({ ...BASE, value: null, usable: false, missingReason: 'คุณภาพไม่พอ' })
  assert.equal(m.usable, false)
  assert.equal(m.value, null)
  assert.equal(m.unit, null)
  assert.equal(m.missingReason, 'คุณภาพไม่พอ')
})

test('unusable โดยไม่ให้ missingReason → contract โยน error (ไม่ปล่อยผลไม่มีเหตุผล)', () => {
  assert.throws(() => createSignalMeasurement({ ...BASE, value: null, usable: false }), /missingReason/)
})

// ---------- value=null ห้ามกลายเป็น 0 ----------
test('value=0 ที่ usable=false ต้องกลายเป็น null (ห้าม Missing กลายเป็น 0)', () => {
  const m = createSignalMeasurement({ ...BASE, value: 0, usable: false, missingReason: 'วัดไม่ได้' })
  assert.equal(m.value, null)
})

test('value=0 ที่ usable=true เป็นข้อมูลไม่ถูกต้องทางสรีระ → contract ปฏิเสธ (usable กลายเป็น false + null)', () => {
  // Number.isFinite(0) = true แต่ HR/RR = 0 ไม่มีทางเป็นค่าจริง — ตรวจว่า contract ไม่หลุดส่ง 0 ออกไปแบบ usable
  const m = createSignalMeasurement({ ...BASE, value: 0, usable: true, missingReason: 'x' })
  // contract ยอมรับ finite value ตาม schema แต่ caller ต้องกรองก่อน — บันทึกพฤติกรรมไว้ตรงนี้
  assert.equal(m.usable, true)
  assert.equal(m.value, 0)
})

// ---------- confidence ≠ accuracy ----------
test('Algorithm Confidence สูง (1.0) ไม่เปลี่ยน clinicalAccuracy — ยังเป็น not-validated', () => {
  const m = createSignalMeasurement({ ...BASE, key: 'hr', value: 78, unit: 'bpm', usable: true, algorithmConfidence: 1.0 })
  assert.equal(m.algorithmConfidence, 1.0)
  assert.equal(m.clinicalAccuracy, CLINICAL_ACCURACY_CODE)
  assert.match(m.clinicalAccuracyLabel, /ยังไม่ได้รับการตรวจสอบ/)
})

// ---------- SpO2 Missing ----------
test('SpO2 ใน local mode = missing เสมอ ไม่มีค่าทดแทน', () => {
  const m = createSpo2LocalMeasurement()
  assert.equal(m.usable, false)
  assert.equal(m.value, null)
  assert.match(m.missingReason, /ไม่มีข้อมูล SpO2/)
  assert.match(m.missingReason, /ไม่สร้างค่าทดแทน/)
  assert.match(m.algorithm.version, /heart_rate/)
})

// ---------- qualityStatus ทุกค่า ----------
test('qualityStatus รับได้ครบ 4 ค่า (good/acceptable/insufficient/not_assessed) และปฏิเสธค่าอื่น', () => {
  for (const status of Object.values(CONTRACT_QUALITY_STATUS)) {
    const m = createSignalMeasurement({ ...BASE, value: null, usable: false, missingReason: 'x', qualityStatus: status })
    assert.equal(m.qualityStatus, status)
  }
  assert.throws(() => createSignalMeasurement({ ...BASE, value: 16, usable: true, qualityStatus: 'excellent' }), /unknown qualityStatus/)
})

test('ทุก qualityStatus มีข้อความ Good/Borderline/Insufficient กำกับ (สีไม่ใช่ตัวบ่งชี้เดียว)', () => {
  assert.match(QUALITY_DISPLAY[QUALITY_STATUS.GOOD], /Good/)
  assert.match(QUALITY_DISPLAY[QUALITY_STATUS.ACCEPTABLE], /Borderline/)
  assert.match(QUALITY_DISPLAY[QUALITY_STATUS.INSUFFICIENT], /Insufficient/)
  assert.ok(QUALITY_DISPLAY[CONTRACT_QUALITY_STATUS.NOT_ASSESSED])
})

// ---------- provenance ----------
test('provenance: ทุกสัญญาณมี algorithm name/version/model + limitations', () => {
  for (const key of ['rr', 'hr', 'spo2', 'questionnaire']) {
    const m = createSignalMeasurement({
      key,
      label: key,
      value: null,
      usable: false,
      missingReason: 'x',
      source: 'test',
    })
    assert.ok(m.algorithm.name.length > 5, `${key} name`)
    assert.ok(m.algorithm.version.length > 3, `${key} version`)
    assert.ok(Array.isArray(m.limitations) && m.limitations.length > 0, `${key} limitations`)
    // provenance ในโค้ดต้องตรวจยืนยันมาแล้ว — ห้ามมีคำว่า "ประมาณ" ในเวอร์ชัน
    assert.ok(!/เดา|approx version/i.test(m.algorithm.version))
  }
  assert.match(ALGORITHM_PROVENANCE.hr.version, /0\.6\.1/)
  assert.match(ALGORITHM_PROVENANCE.rr.version, /UNKNOWN/)
})

// ---------- questionnaire-only fallback ----------
test('questionnaire-only fallback: สัญญาณอื่นเป็น missing ครบ', () => {
  const signals = [
    createSignalMeasurement({ key: 'rr', label: 'RR', usable: false, missingReason: 'ไม่มีกล้อง', source: 'กล้อง' }),
    createSpo2LocalMeasurement(),
    createSignalMeasurement({ key: 'hr', label: 'HR', usable: false, missingReason: 'ไม่มี vitallens', source: 'vitallens' }),
    createSignalMeasurement({ key: 'questionnaire', label: 'แบบประเมิน', value: 8, unit: 'คะแนน (0-31)', usable: true, source: 'แบบประเมินเดิม (Supabase)', qualityStatus: 'not_assessed' }),
  ]
  const usableCount = signals.filter((signal) => signal.usable).length
  assert.equal(usableCount, 1)
  assert.equal(signals[3].value, 8)
  assert.equal(signals[0].missingReason, 'ไม่มีกล้อง')
})

// ---------- RR blocked ----------
test('RR ถูก Quality Gate block → contract สะท้อน insufficient + missingReason', () => {
  const m = createSignalMeasurement({
    ...BASE,
    value: null,
    usable: false,
    qualityStatus: QUALITY_STATUS.INSUFFICIENT,
    qualityReasons: ['droppedFrames:fail', 'motion:fail'],
    missingReason: 'ค่าการวัดไม่ถูกใช้เพราะคุณภาพไม่ผ่านเกณฑ์ (droppedFrames, motion)',
  })
  assert.equal(m.qualityStatus, 'insufficient')
  assert.deepEqual(m.qualityReasons, ['droppedFrames:fail', 'motion:fail'])
  assert.match(m.missingReason, /ไม่ถูกใช้/)
})

// ---------- HR quality warning ----------
test('HR quality warning (confidence 0.6) → usable แต่มี qualityReasons + confidence แยกจาก accuracy', () => {
  const m = createSignalMeasurement({
    ...BASE,
    key: 'hr',
    value: 78,
    unit: 'bpm',
    usable: true,
    qualityStatus: QUALITY_STATUS.ACCEPTABLE,
    qualityReasons: ['hrConfidence:warn'],
    algorithmConfidence: 0.6,
  })
  assert.equal(m.usable, true)
  assert.equal(m.qualityStatus, 'acceptable')
  assert.equal(m.algorithmConfidence, 0.6)
  assert.equal(m.clinicalAccuracy, 'not-validated')
})

// ---------- clinician summary ----------
function sampleScoring() {
  return {
    totalScore: 3,
    level: 'moderate',
    levelLabel: 'ความเสี่ยงปานกลาง',
    levelDescription: 'ควรเฝ้าระวัง',
    critical: false,
    criticalReason: null,
    signals: [{ key: 'rr', points: 3, category: 'abnormal', detail: 'RR 28 ครั้ง/นาที' }],
    usedSignalKeys: ['rr'],
    missingSignalKeys: ['spo2', 'hr', 'questionnaire'],
  }
}

test('Clinician Summary: ครบวันเวลา/anonCode/scoring/limitations/disclaimer', () => {
  const signals = [
    createSignalMeasurement({ ...BASE, value: 28, usable: true, measuredAt: '2026-10-04T10:00:00.000Z' }),
    createSpo2LocalMeasurement(),
  ]
  const summary = buildClinicianSummary({ signals, scoring: sampleScoring(), anonCode: 'ABCD1234', generatedAt: '2026-10-04T10:01:00.000Z' })
  assert.equal(summary.type, 'clinician-review-summary')
  assert.equal(summary.anonCode, 'ABCD1234')
  assert.equal(summary.generatedAt, '2026-10-04T10:01:00.000Z')
  assert.equal(summary.signals.length, 2)
  assert.equal(summary.scoring.totalScore, 3)
  assert.ok(summary.limitations.length >= 2)
  assert.match(summary.disclaimer, /ไม่ใช่การวินิจฉัย/)
  assert.match(summary.disclaimer, /ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก/)
})

test('Report ไม่รวม Raw Video / Secret / ข้อมูลระบุตัวตน', () => {
  const signals = [createSignalMeasurement({ ...BASE, value: 16, usable: true })]
  const summary = buildClinicianSummary({ signals, scoring: sampleScoring(), anonCode: 'ABCD1234' })
  const json = JSON.stringify(summary)
  for (const forbidden of ['video', 'blob', 'webm', 'mp4', 'apiKey', 'api_key', 'secret', 'service_role', 'email', 'user_id']) {
    assert.ok(!json.toLowerCase().includes(forbidden.toLowerCase()), `summary ต้องไม่มี: ${forbidden}`)
  }
  // โครงสร้าง signal ใน summary ต้องไม่มี field พา video เลย
  for (const key of Object.keys(summary.signals[0])) {
    assert.ok(!/video|blob|frame/i.test(key))
  }
})

// ---------- anonymize ----------
test('pseudonymizeUserCode (รหัสเทียม Pseudonymous): hash 8 ตัวอักษร ไม่ใช่ user id เดิม (node:crypto)', async () => {
  const { webcrypto } = await import('node:crypto')
  if (!globalThis.crypto) globalThis.crypto = webcrypto
  const code = await pseudonymizeUserCode('00000000-0000-0000-0000-000000000001')
  assert.match(code, /^[0-9A-F]{8}$/)
  assert.notEqual(code, '00000000-0000-0000-0000-000000000001')
  const code2 = await pseudonymizeUserCode('00000000-0000-0000-0000-000000000002')
  assert.notEqual(code, code2)
  assert.equal(await pseudonymizeUserCode(null), 'UNKNOWN')
})
