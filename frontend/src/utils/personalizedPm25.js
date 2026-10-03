import { getPm25Tier, PRIMARY_PM25_THRESHOLD_SET_ID } from '../data/pm25Thresholds.js'

export const SENSITIVE_PM25_THRESHOLD_SET_ID = 'us_epa_2024'

export function getPersonalizedAudience(profile, latestAssessment, healthProfile) {
  const chronicCondition = String(healthProfile?.chronic_condition || '').trim()
  const hasChronicCondition = chronicCondition && !['ไม่มีโรคประจำตัว', 'ไม่มี', 'none'].includes(chronicCondition.toLowerCase())
  if (!profile?.has_completed_assessment && !hasChronicCondition) {
    return { audience: 'unknown', reason: 'ยังไม่มีผลประเมินสุขภาพที่ครบถ้วน' }
  }

  const answers = latestAssessment?.answers || {}
  // resech_data.md: การสูบบุหรี่ไม่ใช่เกณฑ์ EPA sensitive group จึงไม่ใช้ตั้ง tier หลัก
  // แต่ผู้สูบปัจจุบัน (Assessment.jsx ใช้ค่า some/daily) ยังได้คำเตือนแยก
  const generalWarnings = ['yes', 'some', 'daily'].includes(answers.tobacco)
    ? ['ควรปรึกษาแพทย์']
    : []
  const confirmedSensitive = [
    answers.lungDisease === 'controlled' || answers.lungDisease === 'active',
    answers.comorbidity === 'yes',
    // EPA sensitive-group reference: https://www.epa.gov/node/297090
    answers.age === '65plus',
    // EPA source applies this to pregnancy without trimester splitting:
    // https://www.epa.gov/node/297090
    answers.pregnancy === 'yes',
    // Working assumption selected by the product: under 5 is sensitive; the current
    // assessment must provide an explicit under5 value before this can be applied.
    answers.age === 'under5',
    // Assessment.jsx has no pregnancy/under5 question today; its `vulnerable` question
    // (ตั้งครรภ์/เด็กเล็ก/ผู้สูงอายุ/ภูมิคุ้มกันต่ำ) covers the same EPA sensitive groups.
    answers.vulnerable === 'yes',
    Boolean(hasChronicCondition),
  ].some(Boolean)

  if (confirmedSensitive || ['moderate', 'high_critical'].includes(profile.health_risk_group)) {
    return { audience: 'sensitive', reason: 'อ้างอิงจากแบบประเมินสุขภาพล่าสุด', generalWarnings }
  }

  return { audience: 'general', reason: 'อ้างอิงจากแบบประเมินสุขภาพล่าสุด', generalWarnings }
}

export function getPersonalizedPm25Result(pm25, profile, latestAssessment, healthProfile) {
  const selection = getPersonalizedAudience(profile, latestAssessment, healthProfile)
  const tier = selection.audience === 'unknown'
    ? null
    : getPm25Tier(pm25, selection.audience === 'sensitive' ? SENSITIVE_PM25_THRESHOLD_SET_ID : PRIMARY_PM25_THRESHOLD_SET_ID)
  return { ...selection, tier }
}

// สเกลความรุนแรงของ label จากทั้งสองเกณฑ์ (ไทย 2566 และ US EPA) เรียงจากดีที่สุดไปแย่ที่สุด
// 'เริ่มมีผลกระทบต่อกลุ่มเสี่ยง' และ 'เริ่มมีผลกระทบต่อสุขภาพ' จัดระดับเดียวกัน (จุดเริ่มเตือนของแต่ละเกณฑ์)
const TIER_SEVERITY_TH = {
  'ดีมาก': 0,
  'ดี': 1,
  'ปานกลาง': 2,
  'เริ่มมีผลกระทบต่อกลุ่มเสี่ยง': 3,
  'เริ่มมีผลกระทบต่อสุขภาพ': 3,
  'มีผลกระทบต่อสุขภาพ': 4,
  'มีผลกระทบต่อสุขภาพมาก': 5,
  'อันตราย': 6,
}

// ป้ายเสริม "สำหรับคุณ" ของแต่ละแถวสถานที่: คืนค่าเฉพาะเมื่อ tier ตามเกณฑ์ของผู้ใช้
// รุนแรงกว่า tier ทางการ (thai_2566) ที่ค่า PM2.5 เดียวกัน กลุ่มทั่วไป/unknown ใช้
// เกณฑ์เดียวกับทางการจึงไม่มีความต่างเสมอ
export function getPersonalizedRowBadge(pm25, audience) {
  if (audience !== 'sensitive') return null
  const officialTier = getPm25Tier(pm25, PRIMARY_PM25_THRESHOLD_SET_ID)
  const userTier = getPm25Tier(pm25, SENSITIVE_PM25_THRESHOLD_SET_ID)
  if (!officialTier || !userTier) return null
  return TIER_SEVERITY_TH[userTier.label_th] > TIER_SEVERITY_TH[officialTier.label_th]
    ? { label: userTier.label_th }
    : null
}

// นับแถวที่ต้องแสดงป้ายเสริม สำหรับบรรทัดสรุปเหนือรายการสถานที่
export function countPersonalizedRiskRows(pm25Values, audience) {
  const values = Array.isArray(pm25Values) ? pm25Values : []
  const flagged = values.filter((value) => getPersonalizedRowBadge(value, audience) !== null).length
  return { flagged, total: values.length }
}

// คำแนะนำแยกตามกลุ่มผู้ใช้ อ้างอิง resech_data.md:
// - กรมควบคุมมลพิษ พ.ศ. 2566 — https://www.pcd.go.th/pcd_news/30028/
// - American Lung Association — https://www.lung.org/blog/poor-air-quality-protection
const CLINICAL_GUIDANCE = {
  general: [
    'ตรวจค่าฝุ่นก่อนออกกลางแจ้ง และลดกิจกรรมกลางแจ้งที่ใช้แรงมากในวันที่ฝุ่นเกินเกณฑ์',
    'สวมหน้ากากป้องกัน PM2.5 เมื่อจำเป็นต้องอยู่กลางแจ้งนานในวันฝุ่นสูง',
    'สังเกตอาการผิดปกติ เช่น ไอ หายใจลำบาก และพบแพทย์เมื่อมีอาการ',
  ],
  sensitive: [
    'ลด/หลีกเลี่ยงกิจกรรมกลางแจ้งต่อเนื่องเมื่อฝุ่นสูง และเลื่อนการออกกำลังกายกลางแจ้งไปวันที่อากาศดีกว่า',
    'เตรียมยาและอุปกรณ์ที่จำเป็นติดตัว และปฏิบัติตามคำแนะนำของแพทย์ผู้ดูแล',
    'อยู่ในพื้นที่ปลอดภัยช่วงฝุ่นสูง เช่น ปิดหน้าต่าง หรือใช้เครื่องฟอกอากาศ',
    'หากมีอาการผิดปกติ เช่น หายใจลำบาก เจ็บหน้าอก ให้รีบพบแพทย์',
  ],
  unknown: [
    'ทำแบบประเมินสุขภาพเพื่อรับคำแนะนำที่ตรงกับกลุ่มของคุณ',
    'ระหว่างนี้ ลดกิจกรรมกลางแจ้งที่ใช้แรงมากในวันที่ฝุ่นเกินเกณฑ์',
  ],
}

export function getClinicalGuidancePlaceholder(audience) {
  // TODO: verify + cite these qualitative recommendations with a qualified reviewer (for example GINA/GOLD or Thai authority).
  return {
    status: 'pending_review',
    label: 'คำแนะนำเบื้องต้น รอผู้เชี่ยวชาญตรวจสอบ',
    items: CLINICAL_GUIDANCE[audience] || CLINICAL_GUIDANCE.unknown,
  }
}
