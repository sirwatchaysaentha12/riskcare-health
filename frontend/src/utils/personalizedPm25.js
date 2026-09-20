export function getPersonalizedAudience(profile, latestAssessment, healthProfile) {
  const chronicCondition = String(healthProfile?.chronic_condition || '').trim()
  const hasChronicCondition = chronicCondition && !['ไม่มีโรคประจำตัว', 'ไม่มี', 'none'].includes(chronicCondition.toLowerCase())
  if (!profile?.has_completed_assessment && !hasChronicCondition) {
    return { audience: 'unknown', reason: 'ยังไม่มีผลประเมินสุขภาพที่ครบถ้วน' }
  }

  const answers = latestAssessment?.answers || {}
  const generalWarnings = answers.tobacco === 'yes'
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
    Boolean(hasChronicCondition),
  ].some(Boolean)

  if (confirmedSensitive || ['moderate', 'high_critical'].includes(profile.health_risk_group)) {
    return { audience: 'sensitive', reason: 'อ้างอิงจากแบบประเมินสุขภาพล่าสุด', generalWarnings }
  }

  // Smoking is intentionally excluded from the primary tier because no official
  // sensitive-group criterion is recorded in resech_data.md.
  return { audience: 'general', reason: 'อ้างอิงจากแบบประเมินสุขภาพล่าสุด', generalWarnings }
}

export function getPersonalizedPm25Result(pm25, profile, latestAssessment, getTier, healthProfile) {
  const selection = getPersonalizedAudience(profile, latestAssessment, healthProfile)
  const tier = selection.audience === 'unknown' ? null : getTier(pm25)
  return { ...selection, tier }
}

export function getClinicalGuidancePlaceholder() {
  // TODO: verify + cite these qualitative recommendations with a qualified reviewer (for example GINA/GOLD or Thai authority).
  return {
    status: 'pending_review',
    label: 'คำแนะนำเบื้องต้น รอผู้เชี่ยวชาญตรวจสอบ',
    items: [
      'พกยาประจำตัวตามคำแนะนำเดิม',
      'หลีกเลี่ยงกิจกรรมกลางแจ้งเมื่อมีฝุ่นสูง',
      'พบแพทย์เมื่อมีอาการผิดปกติ',
    ],
  }
}
