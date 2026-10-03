// Respiratory risk scoring — rule-based weighted scoring combining 3 signals:
//   1. Respiratory rate (MediaPipe Pose shoulder tracking, averaged with vitallens RR when both exist)
//   2. SpO2 / heart rate (vitallens rPPG local mode — POS)
//   3. Self-observation questionnaire (reuses the EXISTING Assessment.jsx score, thresholds >=5 / >=10 / >=16 + red flag)
//
// Thresholds follow standard medical screening ranges (WHO/CDC resting-vital references):
//   RR 12-20/min normal; <12 or 21-24 watch; >24 abnormal
//   SpO2 95-100% normal; 90-94% watch; <90% critical
//   HR 60-100 bpm normal at rest; outside = watch
//
// Pure logic, no DOM/React imports — unit-testable with `node --test`.

export type RiskLevel = 'low' | 'moderate' | 'doctor'

export type SignalCategory = 'normal' | 'watch' | 'abnormal' | 'critical' | 'unavailable'

export interface QuestionnaireInput {
  /** Raw score from the existing Assessment.jsx questionnaire (0-31) */
  score: number
  /** Red-flag answer from the existing questionnaire ("ยกผ้าม่านระหว่างหายใจ" etc.) */
  redFlag?: boolean
  /** false = user never completed the existing assessment */
  exists?: boolean
}

export interface RespiratoryRiskInput {
  /** RR from MediaPipe camera measurement (bpm), null/undefined when unavailable */
  rrFromCamera?: number | null
  /** RR reported by vitallens (bpm), null/undefined when unavailable */
  rrFromVitals?: number | null
  /** SpO2 % from vitallens, null/undefined when unavailable (POS local mode does not provide it) */
  spo2Percent?: number | null
  /** Heart rate bpm from vitallens, null/undefined when unavailable */
  hrBpm?: number | null
  /** Result of the existing self-observation questionnaire, null/undefined when user has not taken it */
  questionnaire?: QuestionnaireInput | null
}

export interface SignalResult {
  key: 'rr' | 'spo2' | 'hr' | 'questionnaire'
  label: string
  value: string
  points: number
  category: SignalCategory
  /** Thai explanation tied to the medical threshold used */
  detail: string
}

export interface RespiratoryRiskResult {
  totalScore: number
  level: RiskLevel
  levelLabel: string
  levelDescription: string
  /** tone reused across the app for CSS class suffixes (green/yellow/red) */
  tone: 'green' | 'yellow' | 'red'
  /** SpO2 < 90% or questionnaire red flag — bypasses the total score */
  critical: boolean
  criticalReason: string | null
  signals: SignalResult[]
  usedSignalKeys: string[]
  missingSignalKeys: string[]
  disclaimer: string
}

export const RISK_DISCLAIMER =
  'ใช้โมเดล pose detection (MediaPipe) + rPPG (vitallens) สำเร็จรูป ร่วมกับแบบประเมินอาการ เพื่อคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์'

const LEVELS: Record<RiskLevel, { label: string; description: string; tone: 'green' | 'yellow' | 'red' }> = {
  low: {
    label: 'ความเสี่ยงต่ำ',
    description: 'สัญญาณอยู่ในเกณฑ์ปกติ ควรเฝ้าระวังสุขภาพตามปกติ',
    tone: 'green',
  },
  moderate: {
    label: 'ความเสี่ยงปานกลาง',
    description: 'มีสัญญาณบางส่วนเข้าเกณฑ์เฝ้าระวัง ควรเฝ้าระวังอาการและวัดซ้ำในวันถัดไป',
    tone: 'yellow',
  },
  doctor: {
    label: 'ควรพบแพทย์',
    description: 'มีสัญญาณผิดปกติร่วมกันหลายด้าน หรือมีสัญญาณวิกฤต ควรปรึกษาแพทย์โดยเร็ว',
    tone: 'red',
  },
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** RR: 12-20 = 0 pts; <12 or 21-24 = 1 pt; >24 = 3 pts (WHO/CDC resting respiratory rate) */
export function scoreRr(rr: number | null | undefined): { points: number; category: SignalCategory; detail: string } {
  if (!isFiniteNumber(rr) || rr <= 0) {
    return { points: 0, category: 'unavailable', detail: 'ไม่มีค่าอัตราการหายใจ (RR) จากกล้อง/วิดีโอ' }
  }
  if (rr >= 12 && rr <= 20) {
    return { points: 0, category: 'normal', detail: `RR ${rr} ครั้ง/นาที อยู่ในช่วงปกติ (12-20)` }
  }
  if (rr < 12) {
    return { points: 1, category: 'watch', detail: `RR ${rr} ครั้ง/นาที ต่ำกว่าช่วงปกติ — เข้าเกณฑ์เฝ้าระวัง` }
  }
  if (rr <= 24) {
    return { points: 1, category: 'watch', detail: `RR ${rr} ครั้ง/นาที สูงกว่าช่วงปกติเล็กน้อย — เข้าเกณฑ์เฝ้าระวัง` }
  }
  return { points: 3, category: 'abnormal', detail: `RR ${rr} ครั้ง/นาที สูงกว่า 24 — หายใจเร็วผิดปกติ` }
}

/** SpO2: 95-100 = 0 pts; 90-94 = 2 pts; <90 = 5 pts + critical (immediate doctor warning) */
export function scoreSpo2(
  spo2: number | null | undefined,
): { points: number; category: SignalCategory; detail: string; critical: boolean } {
  if (!isFiniteNumber(spo2) || spo2 <= 0 || spo2 > 100) {
    return { points: 0, category: 'unavailable', detail: 'ไม่มีค่า SpO2 (โหมด local ของ vitallens ไม่ประเมิน SpO2)' }
  }
  if (spo2 < 90) {
    return { points: 5, category: 'critical', detail: `SpO2 ${spo2}% ต่ำกว่า 90% — วิกฤต ต้องพบแพทย์ทันที`, critical: true }
  }
  if (spo2 <= 94) {
    return { points: 2, category: 'watch', detail: `SpO2 ${spo2}% อยู่ในช่วงเฝ้าระวัง (90-94%)`, critical: false }
  }
  return { points: 0, category: 'normal', detail: `SpO2 ${spo2}% อยู่ในช่วงปกติ (95-100%)`, critical: false }
}

/** HR at rest: 60-100 = 0 pts; outside = 1 pt */
export function scoreHr(hr: number | null | undefined): { points: number; category: SignalCategory; detail: string } {
  if (!isFiniteNumber(hr) || hr <= 0) {
    return { points: 0, category: 'unavailable', detail: 'ไม่มีค่าอัตราการเต้นหัวใจ (HR) จาก vitallens' }
  }
  if (hr >= 60 && hr <= 100) {
    return { points: 0, category: 'normal', detail: `HR ${Math.round(hr)} bpm อยู่ในช่วงปกติขณะพัก (60-100)` }
  }
  return { points: 1, category: 'watch', detail: `HR ${Math.round(hr)} bpm อยู่นอกช่วงปกติขณะพัก (60-100) — เข้าเกณฑ์เฝ้าระวัง` }
}

/**
 * Convert the EXISTING questionnaire score (Assessment.jsx, 0-31) onto the same risk-point scale.
 * The mapping reuses the existing thresholds (>=5 moderate, >=10 high, >=16 very-high,
 * red flag = critical) — no new criteria are invented.
 */
export function questionnaireRiskPoints(
  questionnaire: QuestionnaireInput | null | undefined,
): { points: number; category: SignalCategory; detail: string; critical: boolean } {
  if (!questionnaire || questionnaire.exists === false) {
    return { points: 0, category: 'unavailable', detail: 'ยังไม่มีผลแบบประเมินอาการ (Self-Observation)' }
  }
  const score = isFiniteNumber(questionnaire.score) ? Math.max(0, questionnaire.score) : 0
  const redFlag = questionnaire.redFlag === true
  if (redFlag) {
    return {
      points: 4,
      category: 'critical',
      detail: `แบบประเมินเดิมชี้อาการเร่งด่วน (red flag, คะแนน ${score}) — ต้องพบแพทย์`,
      critical: true,
    }
  }
  if (score >= 16) {
    return { points: 4, category: 'abnormal', detail: `แบบประเมินเดิมคะแนน ${score}/31 — ระดับสูงมาก`, critical: false }
  }
  if (score >= 10) {
    return { points: 3, category: 'abnormal', detail: `แบบประเมินเดิมคะแนน ${score}/31 — ระดับสูง`, critical: false }
  }
  if (score >= 5) {
    return { points: 2, category: 'watch', detail: `แบบประเมินเดิมคะแนน ${score}/31 — ระดับปานกลาง`, critical: false }
  }
  if (score >= 1) {
    return { points: 1, category: 'watch', detail: `แบบประเมินเดิมคะแนน ${score}/31 — มีอาการบ้างเล็กน้อย`, critical: false }
  }
  return { points: 0, category: 'normal', detail: `แบบประเมินเดิมคะแนน 0/31 — ไม่มีอาการ`, critical: false }
}

/** Average camera RR with vitallens RR only when BOTH exist (per spec); otherwise use whichever exists. */
export function averageRr(rrFromCamera: number | null | undefined, rrFromVitals: number | null | undefined): number | null {
  const cameraOk = isFiniteNumber(rrFromCamera) && rrFromCamera > 0
  const vitalsOk = isFiniteNumber(rrFromVitals) && rrFromVitals > 0
  if (cameraOk && vitalsOk) return (rrFromCamera + rrFromVitals) / 2
  if (cameraOk) return rrFromCamera
  if (vitalsOk) return rrFromVitals
  return null
}

function questionnaireLabel(questionnaire: QuestionnaireInput | null | undefined): string {
  if (!questionnaire || questionnaire.exists === false) return 'ไม่มีข้อมูล'
  return `คะแนน ${questionnaire.score}/31${questionnaire.redFlag ? ' + red flag' : ''}`
}

/**
 * Main entry: combine all signals into a total score and risk level.
 * Level: 0-2 low; 3-5 moderate; 6+ OR SpO2 < 90% OR questionnaire red flag → doctor (immediate, not waiting for the sum).
 */
export function computeRespiratoryRisk(input: RespiratoryRiskInput): RespiratoryRiskResult {
  const rr = averageRr(input.rrFromCamera, input.rrFromVitals)
  const rrResult = scoreRr(rr)
  const spo2Result = scoreSpo2(input.spo2Percent)
  const hrResult = scoreHr(input.hrBpm)
  const questionnaireResult = questionnaireRiskPoints(input.questionnaire)

  const signals: SignalResult[] = [
    {
      key: 'rr',
      label: 'อัตราการหายใจ (RR)',
      value: rr != null ? `${Math.round(rr)} ครั้ง/นาที` : 'ไม่วัดได้',
      points: rrResult.points,
      category: rrResult.category,
      detail: rrResult.detail,
    },
    {
      key: 'spo2',
      label: 'ออกซิเจนในเลือด (SpO2)',
      value: isFiniteNumber(input.spo2Percent) && input.spo2Percent > 0 ? `${input.spo2Percent}%` : 'ไม่วัดได้',
      points: spo2Result.points,
      category: spo2Result.category,
      detail: spo2Result.detail,
    },
    {
      key: 'hr',
      label: 'อัตราการเต้นหัวใจ (HR)',
      value: isFiniteNumber(input.hrBpm) && input.hrBpm > 0 ? `${Math.round(input.hrBpm)} bpm` : 'ไม่วัดได้',
      points: hrResult.points,
      category: hrResult.category,
      detail: hrResult.detail,
    },
    {
      key: 'questionnaire',
      label: 'แบบประเมินอาการ (Self-Observation)',
      value: questionnaireLabel(input.questionnaire),
      points: questionnaireResult.points,
      category: questionnaireResult.category,
      detail: questionnaireResult.detail,
    },
  ]

  const totalScore =
    rrResult.points + spo2Result.points + hrResult.points + questionnaireResult.points

  const criticalReason =
    spo2Result.critical
      ? 'SpO2 ต่ำกว่า 90% — ต้องพบแพทย์ทันที'
      : questionnaireResult.critical
        ? 'แบบประเมินอาการชี้อาการเร่งด่วน (red flag) — ต้องพบแพทย์'
        : null

  let level: RiskLevel
  if (criticalReason || totalScore >= 6) {
    level = 'doctor'
  } else if (totalScore >= 3) {
    level = 'moderate'
  } else {
    level = 'low'
  }
  if (criticalReason && totalScore < 6) level = 'doctor'

  const usedSignalKeys = signals.filter((s) => s.category !== 'unavailable').map((s) => s.key)
  const missingSignalKeys = signals.filter((s) => s.category === 'unavailable').map((s) => s.key)

  const meta = LEVELS[level]
  return {
    totalScore,
    level,
    levelLabel: meta.label,
    levelDescription: criticalReason ?? meta.description,
    tone: meta.tone,
    critical: Boolean(criticalReason),
    criticalReason,
    signals,
    usedSignalKeys,
    missingSignalKeys,
    disclaimer: RISK_DISCLAIMER,
  }
}
