// Primary UI standard: Thai announcement 2566. EPA remains available for reference/sensitive context.
// Source citation is pending because official-standards.md is not present in this workspace.
export const PRIMARY_PM25_THRESHOLD_SET_ID = 'thai_2566'
export const PM25_THRESHOLD_SETS = {
  us_epa_2024: {
    set_id: 'us_epa_2024', pollutant: 'PM2.5', unit: 'µg/m³', averaging_period: '24h',
    source: 'US EPA PM2.5 breakpoint (2024)', version: '2024', effective_date: null,
    entries: [
      { min_inclusive: 0, max_inclusive: 9.0, level_code: 'good', label_th: 'ดี', label_en: 'Good', color_token: 'green' },
      { min_inclusive: 9.1, max_inclusive: 35.4, level_code: 'moderate', label_th: 'ปานกลาง', label_en: 'Moderate', color_token: 'lime' },
      { min_inclusive: 35.5, max_inclusive: 55.4, level_code: 'unhealthy_sensitive', label_th: 'เริ่มมีผลกระทบต่อกลุ่มเสี่ยง', label_en: 'Unhealthy for Sensitive Groups', color_token: 'yellow' },
      { min_inclusive: 55.5, max_inclusive: 125.4, level_code: 'unhealthy', label_th: 'มีผลกระทบต่อสุขภาพ', label_en: 'Unhealthy', color_token: 'orange' },
      { min_inclusive: 125.5, max_inclusive: 225.4, level_code: 'very_unhealthy', label_th: 'มีผลกระทบต่อสุขภาพมาก', label_en: 'Very Unhealthy', color_token: 'red' },
      { min_inclusive: 225.5, max_inclusive: null, level_code: 'hazardous', label_th: 'อันตราย', label_en: 'Hazardous', color_token: 'red' },
    ],
  },
  thai_2566: {
    set_id: 'thai_2566', pollutant: 'PM2.5', unit: 'µg/m³', averaging_period: '24h',
    source: 'เกณฑ์ไทย ประกาศ คพ. 2566', version: '2566', effective_date: null,
    entries: [
      { min_inclusive: 0, max_inclusive: 15.0, level_code: 'very_good', label_th: 'ดีมาก', label_en: 'Very good', color_token: 'green' },
      { min_inclusive: 15.1, max_inclusive: 25.0, level_code: 'good', label_th: 'ดี', label_en: 'Good', color_token: 'lime' },
      { min_inclusive: 25.1, max_inclusive: 37.5, level_code: 'moderate', label_th: 'ปานกลาง', label_en: 'Moderate', color_token: 'yellow' },
      { min_inclusive: 37.6, max_inclusive: 75.0, level_code: 'health_impact_start', label_th: 'เริ่มมีผลกระทบต่อสุขภาพ', label_en: 'Starting to affect health', color_token: 'orange' },
      { min_inclusive: 75.1, max_inclusive: null, level_code: 'health_impact', label_th: 'มีผลกระทบต่อสุขภาพ', label_en: 'Affecting health', color_token: 'red' },
    ],
  },
}

export function getPm25Tier(value, setId = 'thai_2566') {
  const numericValue = Number(value)
  const thresholdSet = PM25_THRESHOLD_SETS[setId]
  if (!thresholdSet || !Number.isFinite(numericValue) || numericValue < 0) return null
  return thresholdSet.entries.find((entry) => numericValue >= entry.min_inclusive && (entry.max_inclusive === null || numericValue <= entry.max_inclusive)) || null
}
