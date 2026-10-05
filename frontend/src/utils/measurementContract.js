// Unified Measurement Contract (Phase 3) — โครงสร้าง metadata มาตรฐานเดียวของทุกสัญญาณ
// เป้าหมาย: แพทย์ตรวจสอบได้ว่าค่ามาจากไหน คุณภาพเท่าไร วัดเมื่อไร ใช้อัลกอริทึมอะไร ข้อจำกัดอะไร
// กฎเหล็กของ contract:
//   - วัดไม่ได้ → value ต้องเป็น null (ห้าม 0 ห้ามค่าปกติ) และต้องมี missingReason
//   - algorithmConfidence ≠ clinicalAccuracy (confidence สูงไม่ใช่ความถูกต้อง)
//   - clinicalAccuracy = 'not-validated' จนกว่าจะเทียบอุปกรณ์อ้างอิงจริง
//   - SpO2 ใน VitalLens POS local mode = missing เสมอ (local ให้เฉพาะ HR ตาม pos.py supported_vitals)
// Pure logic ไม่มี DOM/React — unit-testable with node --test

import { CLINICAL_ACCURACY_STATUS, QUALITY_STATUS } from './signalQuality.js'

export const MEASUREMENT_SCHEMA_VERSION = 'phase3-contract-1.0'

/** คลังค่า qualityStatus ของทั้งระบบ (ค่าเดียวกับ signalQuality.js + not_assessed สำหรับสัญญาณที่ไม่มีการวัดภาพ) */
export const CONTRACT_QUALITY_STATUS = {
  ...QUALITY_STATUS,
  NOT_ASSESSED: 'not_assessed',
}

/** ข้อความแสดงผล — สีไม่ใช่ตัวบ่งชี้เพียงอย่างเดียว (มีคำ Good/Borderline/Insufficient กำกับ) */
export const QUALITY_DISPLAY = {
  [QUALITY_STATUS.GOOD]: 'Good — คุณภาพดี',
  [QUALITY_STATUS.ACCEPTABLE]: 'Borderline — คุณภาพพอใช้ (มีข้อควรระวัง)',
  [QUALITY_STATUS.INSUFFICIENT]: 'Insufficient — คุณภาพไม่พอ (ค่าไม่ถูกใช้)',
  [CONTRACT_QUALITY_STATUS.NOT_ASSESSED]: 'ไม่มีการประเมินคุณภาพสัญญาณสำหรับสัญญาณนี้',
}

export const CLINICAL_ACCURACY_CODE = 'not-validated'

/** ข้อมูล provenance ของอัลกอริทึม — ตัวเลขเวอร์ชันมาจากการตรวจแพ็กเกจจริง ห้ามเดา (ที่ไม่ยืนยันให้ UNKNOWN) */
export const ALGORITHM_PROVENANCE = {
  rr: {
    name: 'MediaPipe Pose Landmarker — ประมาณอัตราการหายใจจากการเคลื่อนไหวไหล่ (peak counting + periodicity gate)',
    version: 'tasks-vision: UNKNOWN (vendored offline — ไม่มี version string ฝังใน vision_bundle.mjs/wasm)',
    model: 'pose_landmarker_lite.task (Google MediaPipe, Apache 2.0)',
    limitations: [
      'RR มาจากการเคลื่อนไหวไหล่ทางอ้อม ไม่ใช่การนับหายใจทางคลินิก',
      'อาจคลาดเคลื่อนเมื่อผู้ใช้ขยับตัว พูด ไอ สวมเสื้อหลวม หรือมุมกล้องไม่เห็นไหล่',
      'ยังไม่ผ่านการเทียบกับการนับโดยบุคลากรทางการแพทย์หรืออุปกรณ์อ้างอิง',
    ],
  },
  hr: {
    name: 'VitalLens local POS (rPPG จากสีผิวใบหน้า, POS algorithm ของ Wang et al. 2017)',
    version: 'vitallens 0.6.1 / vitallens-core 0.2.3 (ตรวจจาก pip จริง)',
    model: 'face detector: Ultra-Light-Fast-Generic-Face-Detector-1MB (model_rfb_320.onnx, MIT)',
    limitations: [
      'เป็นการประมาณจากวิดีโอใบหน้า ไม่ใช่เครื่องวัดชีพจรทางการแพทย์',
      'Algorithm Confidence เป็นตัวชี้วัดภายในอัลกอริทึม ไม่ใช่ความแม่นยำทางคลินิก',
      'ต้องการแสงสว่างเพียงพอ ใบหน้าชัด และนิ่ง — แสงน้อย/เบลอทำให้ค่าใช้ไม่ได้',
      'ยังไม่ผ่านการเทียบกับ ECG/เครื่อง monitor อ้างอิง',
    ],
  },
  spo2: {
    name: 'ไม่มีอัลกอริทึม — VitalLens POS local mode ไม่ประเมิน SpO2',
    version: 'n/a (supported_vitals=["heart_rate"] เท่านั้น ตามซอร์ส vitallens pos.py)',
    model: 'n/a',
    limitations: [
      'ระบบไม่สร้างค่า SpO2 ทดแทนทุกกรณี',
      'หากต้องการค่า SpO2 ให้ใช้เครื่องวัดออกซิเจนแบบคลิปนิ้ว (Pulse Oximeter) ที่ตรวจสอบได้',
      'ค่าจากอุปกรณ์ภายนอกต้องระบุที่มาชัดเจนว่ามาจากอุปกรณ์ ไม่ใช่จากวิดีโอ',
    ],
  },
  questionnaire: {
    name: 'แบบประเมินอาการเดิม (Assessment.jsx — 14 ข้อ)',
    version: 'เกณฑ์เดิมของระบบ: ≥5 ปานกลาง / ≥10 สูง / ≥16 สูงมาก + red flag (ไม่แก้)',
    model: 'n/a (rule-based)',
    limitations: [
      'เป็นการรายงานอาการตามที่ผู้ใช้ตอบเอง ไม่ใช่การตรวจร่างกาย',
    ],
  },
}

/**
 * สร้าง measurement object ตาม contract — บังคับกฎเหล็กทุกข้อ
 * @param {object} input
 * @param {string} input.key                  rr | hr | spo2 | questionnaire
 * @param {string} input.label
 * @param {number|null} input.value           ค่าที่วัดได้ (ถ้า usable=false จะถูกบังคับเป็น null)
 * @param {string|null} input.unit
 * @param {boolean} input.usable
 * @param {string} input.source               แหล่งที่มาแบบอ่านได้ เช่น 'กล้อง (MediaPipe)' / 'vitallens (ประมวลผลในเครื่อง)'
 * @param {string|null} input.measuredAt      ISO timestamp
 * @param {number|null} input.durationSeconds
 * @param {string} input.qualityStatus        good | acceptable | insufficient | not_assessed
 * @param {string[]} input.qualityReasons
 * @param {number|null} input.algorithmConfidence
 * @param {string|null} input.missingReason   บังคับเมื่อ usable=false
 */
export function createSignalMeasurement(input) {
  const {
    key, label, value = null, unit = null, usable = false, source,
    measuredAt = null, durationSeconds = null,
    qualityStatus = CONTRACT_QUALITY_STATUS.NOT_ASSESSED, qualityReasons = [],
    algorithmConfidence = null, missingReason = null,
  } = input || {}

  const validQuality = Object.values(CONTRACT_QUALITY_STATUS).includes(qualityStatus)
  if (!validQuality) {
    throw new Error(`unknown qualityStatus: ${qualityStatus}`)
  }
  const finalUsable = Boolean(usable) && Number.isFinite(value)
  if (!finalUsable && !missingReason) {
    throw new Error(`signal "${key}" unusable ต้องมี missingReason`)
  }
  const provenance = ALGORITHM_PROVENANCE[key]
  if (!provenance) throw new Error(`unknown signal key: ${key}`)

  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    key,
    label,
    // กฎ: วัดไม่ได้ = null เสมอ (แม้ผู้เรียกส่ง 0 มา)
    value: finalUsable ? value : null,
    unit: finalUsable ? unit : null,
    usable: finalUsable,
    source,
    measuredAt,
    durationSeconds,
    qualityStatus,
    qualityReasons,
    algorithmConfidence: Number.isFinite(algorithmConfidence) ? algorithmConfidence : null,
    clinicalAccuracy: CLINICAL_ACCURACY_CODE,
    clinicalAccuracyLabel: CLINICAL_ACCURACY_STATUS,
    missingReason: finalUsable ? null : missingReason,
    algorithm: { name: provenance.name, version: provenance.version, model: provenance.model },
    limitations: provenance.limitations,
  }
}

/** SpO2 ในโหมด local — ต้องเป็น missing เสมอ (ห้ามสร้างค่าทดแทนทุกกรณี) */
export function createSpo2LocalMeasurement() {
  return createSignalMeasurement({
    key: 'spo2',
    label: 'ออกซิเจนในเลือด (SpO2)',
    value: null,
    unit: '%',
    usable: false,
    source: 'ไม่มี — VitalLens POS local mode ไม่ประเมิน SpO2',
    qualityStatus: CONTRACT_QUALITY_STATUS.NOT_ASSESSED,
    missingReason: 'ไม่มีข้อมูล SpO2 — โหมด local ของ vitallens ไม่ประเมิน SpO2 และระบบไม่สร้างค่าทดแทน (ใช้ Pulse Oximeter ภายนอกหากมี)',
  })
}

/** สถานะ provenance ระดับระบบ (Phase 9) — แสดงบนหน้าเว็บเพื่อความโปร่งใส; ที่ไม่ทราบจริง = UNKNOWN — REQUIRES REVIEW */
export const DATA_PROVENANCE_STATUS = {
  lastEvaluationDate: '2026-10-04',
  metricsStatus: 'Track A signal-only evaluation บน BIDMC (2026-10-04) — clinical accuracy: not-validated',
  trainingSource: 'ไม่มี — โมเดลพรีเทรน third-party (MediaPipe, vitallens POS) + rule-based scoring ไม่มีการเทรนใหม่',
  evaluation: {
    dataset: 'BIDMC PPG and Respiration v1.0.0 (PhysioNet, ODC-By 1.0)',
    track: 'Signal Processing Only (Track A)',
    modality: 'Impedance Respiration / PPG / ECG (125 Hz) — ไม่มีวิดีโอ',
    evaluationDate: '2026-10-04',
    participantCount: 53,
    windowCount: 842,
    windowsUsed: 484,
    metrics: {
      mae: '9.03 ครั้ง/นาที (95% CI 8.49-9.54)',
      rmse: '10.74',
      meanBias: '+8.92 ครั้ง/นาที (overcount อย่างเป็นระบบ — cardiogenic artifact บน impedance)',
      acceptableErrorPct: '20.7% (±2)',
      abstentionRate: '42.4%',
    },
    cameraAccuracy: 'Not validated — BIDMC ไม่มีวิดีโอ (ห้ามอ้าง)',
    clinicalAccuracy: 'Not validated',
    report: 'TRACK-A-OFFLINE-VALIDATION-REPORT.md',
  },
  libraries: [
    {
      role: 'RR — Pose estimation (ประมาณอัตราการหายใจ)',
      name: 'MediaPipe Pose Landmarker',
      version: 'UNKNOWN — REQUIRES REVIEW (vendored tasks-vision ไม่มี version string)',
      license: 'Apache 2.0 (MediaPipe + pose_landmarker_lite)',
    },
    {
      role: 'HR — rPPG จากใบหน้า (POS local)',
      name: 'VitalLens (vitallens + vitallens-core)',
      version: 'vitallens 0.6.1 / vitallens-core 0.2.3 (ตรวจจาก pip)',
      license: 'MIT (© 2026 Rouast Labs)',
    },
    {
      role: 'SpO2',
      name: 'ไม่มี — VitalLens POS local mode ไม่ประเมิน SpO2',
      version: 'n/a',
      license: 'n/a',
    },
  ],
}

/**
 * สร้างรายงานสำหรับแพทย์ (Clinician Review Summary)
 * - ใช้รหัสผู้ใช้แบบ Pseudonymous (รหัสเทียม) ไม่แสดงตัวตน — แต่ต้องเรียกว่า Pseudonymous ไม่ใช่ Anonymous
 * - ไม่รวม raw video / secret / ข้อมูลระบุตัวตน
 * @param {object} input
 * @param {object[]} input.signals    ผลจาก createSignalMeasurement
 * @param {object} input.scoring      ผลจาก computeRespiratoryRisk
 * @param {string} input.anonCode     รหัสอ้างอิงไม่ระบุตัวตน
 * @param {string|null} input.generatedAt
 */
export function buildClinicianSummary(input) {
  const { signals = [], scoring, anonCode = 'UNKNOWN', generatedAt = null } = input || {}
  if (!scoring) throw new Error('clinician summary ต้องมีผล scoring')
  return {
    schemaVersion: MEASUREMENT_SCHEMA_VERSION,
    type: 'clinician-review-summary',
    generatedAt: generatedAt || new Date().toISOString(),
    anonCode,
    signals: signals.map((signal) => ({
      key: signal.key,
      label: signal.label,
      value: signal.value,
      unit: signal.unit,
      usable: signal.usable,
      source: signal.source,
      measuredAt: signal.measuredAt,
      durationSeconds: signal.durationSeconds,
      qualityStatus: signal.qualityStatus,
      qualityReasons: signal.qualityReasons,
      missingReason: signal.missingReason,
      algorithmConfidence: signal.algorithmConfidence,
      clinicalAccuracy: signal.clinicalAccuracy,
      algorithm: signal.algorithm,
    })),
    scoring: {
      totalScore: scoring.totalScore,
      level: scoring.level,
      levelLabel: scoring.levelLabel,
      levelDescription: scoring.levelDescription,
      critical: scoring.critical,
      criticalReason: scoring.criticalReason,
      perSignalPoints: scoring.signals.map((signal) => ({ key: signal.key, points: signal.points, category: signal.category, detail: signal.detail })),
      usedSignalKeys: scoring.usedSignalKeys,
      missingSignalKeys: scoring.missingSignalKeys,
    },
    limitations: signals.flatMap((signal) => signal.limitations),
    disclaimer: 'รายงานนี้เป็นข้อมูลประกอบการประเมินโดยบุคลากรทางการแพทย์เท่านั้น ไม่ใช่การวินิจฉัยโรค ไม่ใช่ค่าจากอุปกรณ์การแพทย์ และยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก (Prototype)',
    dataPolicy: 'รายงานนี้ไม่รวมวิดีโอดิบ รูปภาพ หรือความลับการเข้าถึงระบบ ผู้ใช้ถูกอ้างอิงด้วยรหัสเทียม (Pseudonymous ID) — ไม่ใช่ข้อมูลไม่ระบุตัวตนโดยสมบูรณ์',
  }
}

/**
 * สร้างรหัสผู้ใช้แบบ Pseudonymous (รหัสเทียม — hash สั้น ไม่แสดงตัวตน แต่ไม่ใช่ Anonymous เพราะระบบยังเชื่อมกับ session จริงได้)
 */
export async function pseudonymizeUserCode(userId) {
  if (!userId) return 'UNKNOWN'
  const data = new TextEncoder().encode(`respiratory-risk:${userId}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest).slice(0, 4)
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}
