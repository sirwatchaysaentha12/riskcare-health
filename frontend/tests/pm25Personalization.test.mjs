import test from 'node:test'
import assert from 'node:assert/strict'
import { PM25_THRESHOLD_SETS, getPm25Tier } from '../src/data/pm25Thresholds.js'
import { countPersonalizedRiskRows, getClinicalGuidancePlaceholder, getPersonalizedAudience, getPersonalizedPm25Result, getPersonalizedRowBadge } from '../src/utils/personalizedPm25.js'

test('Thai PM2.5 boundaries use only supplied values', () => {
  const values = [0, 15.0, 15.1, 25.0, 25.1, 37.5, 37.6, 75.0, 75.1]
  assert.deepEqual(values.map((value) => getPm25Tier(value)?.level_code), [
    'very_good', 'very_good', 'good', 'good', 'moderate', 'moderate', 'health_impact_start', 'health_impact_start', 'health_impact',
  ])
  assert.equal(getPm25Tier(-1), null)
  assert.equal(getPm25Tier('not-a-number'), null)
})

test('EPA PM2.5 boundaries use only supplied values', () => {
  const values = [0, 9.0, 9.1, 35.4, 35.5, 55.4, 55.5, 125.4, 125.5, 225.4, 225.5]
  assert.deepEqual(values.map((value) => getPm25Tier(value, 'us_epa_2024')?.level_code), [
    'good', 'good', 'moderate', 'moderate', 'unhealthy_sensitive', 'unhealthy_sensitive', 'unhealthy', 'unhealthy', 'very_unhealthy', 'very_unhealthy', 'hazardous',
  ])
})

test('risk factors map to sensitive without scoring or multipliers', () => {
  const base = { has_completed_assessment: true, health_risk_group: 'low' }
  assert.equal(getPersonalizedAudience(base, { answers: { lungDisease: 'active' } }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience(base, { answers: { comorbidity: 'yes' } }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience(base, { answers: { age: '65plus' } }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience(base, { answers: { pregnancy: 'yes' } }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience(base, { answers: { age: 'under5' } }).audience, 'sensitive')
  // Assessment.jsx asks `vulnerable` (ตั้งครรภ์/เด็กเล็ก/ผู้สูงอายุ/ภูมิคุ้มกันต่ำ) instead of pregnancy/under5 today.
  assert.equal(getPersonalizedAudience(base, { answers: { vulnerable: 'yes' } }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience({ ...base, health_risk_group: 'moderate' }, { answers: {} }).audience, 'sensitive')
  // Current smokers (some/daily) get the extra warning; quitters (past) and non-smokers do not.
  assert.equal(getPersonalizedAudience(base, { answers: { tobacco: 'yes' } }).audience, 'general')
  assert.equal(getPersonalizedAudience(base, { answers: { tobacco: 'yes' } }).generalWarnings.length, 1)
  assert.equal(getPersonalizedAudience(base, { answers: { tobacco: 'daily' } }).generalWarnings.length, 1)
  assert.equal(getPersonalizedAudience(base, { answers: { tobacco: 'some' } }).generalWarnings.length, 1)
  assert.equal(getPersonalizedAudience(base, { answers: { tobacco: 'past' } }).generalWarnings.length, 0)
  assert.equal(getPersonalizedAudience(base, { answers: {} }).audience, 'general')
  assert.equal(getPersonalizedAudience({ has_completed_assessment: false }, null, { chronic_condition: 'โรคหอบหืด' }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience({ has_completed_assessment: false }, null).audience, 'unknown')
})

test('clinical guidance differs by audience and is marked pending review', () => {
  const general = getClinicalGuidancePlaceholder('general')
  const sensitive = getClinicalGuidancePlaceholder('sensitive')
  const unknown = getClinicalGuidancePlaceholder('unknown')
  const fallback = getClinicalGuidancePlaceholder()
  assert.equal(general.status, 'pending_review')
  assert.equal(sensitive.status, 'pending_review')
  assert.notDeepEqual(general.items, sensitive.items)
  assert.notDeepEqual(general.items, unknown.items)
  assert.deepEqual(fallback.items, unknown.items)
  assert.ok(general.items.length >= 3)
  assert.ok(sensitive.items.length >= 3)
})

test('personalized tier uses a lower sensitive breakpoint at PM2.5=40', () => {
  const general = getPersonalizedPm25Result(40, { has_completed_assessment: true, health_risk_group: 'low' }, { answers: {} })
  const sensitive = getPersonalizedPm25Result(40, { has_completed_assessment: true, health_risk_group: 'low' }, { answers: { lungDisease: 'active' } })
  assert.equal(general.audience, 'general')
  assert.equal(general.tier.level_code, 'health_impact_start')
  assert.equal(sensitive.audience, 'sensitive')
  assert.equal(sensitive.tier.level_code, 'unhealthy_sensitive')
  assert.ok(sensitive.tier.min_inclusive < general.tier.min_inclusive)
})

test('chronic condition in health_profiles lifts a user to sensitive without an assessment', () => {
  const chronic = getPersonalizedPm25Result(40, { has_completed_assessment: false, health_risk_group: 'low' }, null, { chronic_condition: 'โรคปอดอุดกั้นเรื้อรัง' })
  assert.equal(chronic.audience, 'sensitive')
  assert.equal(chronic.tier.level_code, 'unhealthy_sensitive')
})

test('same location and PM2.5 shows a stricter level for the sick user than the healthy user', () => {
  // Live-verified scenario (เชียงใหม่, PM2.5 12.2 µg/m³): คนสุขภาพดีเห็น "ดีมาก" (เกณฑ์ไทย)
  // ส่วนคนมีโรคปอดเห็น "ปานกลาง" (เกณฑ์ US EPA สำหรับกลุ่มไวต่อผลกระทบ)
  const base = { has_completed_assessment: true, health_risk_group: 'low' }
  const healthy = getPersonalizedPm25Result(12.2, base, { answers: {} })
  const sick = getPersonalizedPm25Result(12.2, base, { answers: { lungDisease: 'active' } })
  assert.equal(healthy.audience, 'general')
  assert.equal(sick.audience, 'sensitive')
  assert.equal(healthy.tier.label_th, 'ดีมาก')
  assert.equal(sick.tier.label_th, 'ปานกลาง')
  assert.notEqual(getClinicalGuidancePlaceholder(healthy.audience).items, getClinicalGuidancePlaceholder(sick.audience).items)
})

test('sensitive user never sees a better level than the general user at the same PM2.5', () => {
  // สเกลความรุนแรงของ label จากทั้งสองเกณฑ์ (ไทย 2566 และ US EPA) เรียงจากดีที่สุดไปแย่ที่สุด
  const severity = {
    'ดีมาก': 0,
    'ดี': 1,
    'ปานกลาง': 2,
    'เริ่มมีผลกระทบต่อกลุ่มเสี่ยง': 3,
    'เริ่มมีผลกระทบต่อสุขภาพ': 3,
    'มีผลกระทบต่อสุขภาพ': 4,
    'มีผลกระทบต่อสุขภาพมาก': 5,
    'อันตราย': 6,
  }
  const base = { has_completed_assessment: true, health_risk_group: 'low' }
  for (let step = 0; step <= 300; step += 1) {
    const value = step / 2
    const general = getPersonalizedPm25Result(value, base, { answers: {} })
    const sensitive = getPersonalizedPm25Result(value, base, { answers: { lungDisease: 'active' } })
    assert.ok(
      severity[sensitive.tier.label_th] >= severity[general.tier.label_th],
      `sensitive level better than general at PM2.5=${value} (${sensitive.tier.label_th} vs ${general.tier.label_th})`,
    )
  }
})

test('row badge appears only when the sensitive tier is worse than the official tier', () => {
  // กลุ่มทั่วไป/unknown ใช้เกณฑ์เดียวกับทางการ ไม่มีป้ายทุกค่า
  assert.equal(getPersonalizedRowBadge(12.2, 'general'), null)
  assert.equal(getPersonalizedRowBadge(40, 'general'), null)
  assert.equal(getPersonalizedRowBadge(12.2, 'unknown'), null)
  // ทางการ ดีมาก (0) vs sensitive ดี (1) → ป้ายระดับ "ดี"
  assert.deepEqual(getPersonalizedRowBadge(5, 'sensitive'), { label: 'ดี' })
  // ทางการ ดีมาก (0) vs sensitive ปานกลาง (2) → ป้ายระดับ "ปานกลาง"
  assert.deepEqual(getPersonalizedRowBadge(12.2, 'sensitive'), { label: 'ปานกลาง' })
  // ทางการ ปานกลาง (2) vs sensitive เริ่มมีผลกระทบต่อกลุ่มเสี่ยง (3) → มีป้าย
  assert.deepEqual(getPersonalizedRowBadge(36, 'sensitive'), { label: 'เริ่มมีผลกระทบต่อกลุ่มเสี่ยง' })
  // tier เท่ากัน/เทียบเท่ากัน ไม่มีป้าย: 30 (ปานกลาง ทั้งคู่), 40 (จุดเริ่มเตือนของแต่ละเกณฑ์ เทียบเท่ากัน)
  assert.equal(getPersonalizedRowBadge(30, 'sensitive'), null)
  assert.equal(getPersonalizedRowBadge(40, 'sensitive'), null)
  // ค่าไม่ valid ไม่มีป้าย
  assert.equal(getPersonalizedRowBadge(-1, 'sensitive'), null)
  assert.equal(getPersonalizedRowBadge('not-a-number', 'sensitive'), null)
})

test('summary counts flagged rows and shows only for the sensitive audience', () => {
  assert.deepEqual(countPersonalizedRiskRows([12.2, 30, 36], 'sensitive'), { flagged: 2, total: 3 })
  assert.deepEqual(countPersonalizedRiskRows([12.2, 36], 'general'), { flagged: 0, total: 2 })
  assert.deepEqual(countPersonalizedRiskRows([30, 30], 'sensitive'), { flagged: 0, total: 2 })
  assert.deepEqual(countPersonalizedRiskRows([], 'sensitive'), { flagged: 0, total: 0 })
})

assert.equal(PM25_THRESHOLD_SETS.thai_2566.entries[3].min_inclusive, 37.6)
