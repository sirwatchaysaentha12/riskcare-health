import test from 'node:test'
import assert from 'node:assert/strict'
import { PM25_THRESHOLD_SETS, getPm25Tier } from '../src/data/pm25Thresholds.js'
import { getClinicalGuidancePlaceholder, getPersonalizedAudience } from '../src/utils/personalizedPm25.js'

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
  assert.equal(getPersonalizedAudience({ ...base, health_risk_group: 'moderate' }, { answers: {} }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience(base, { answers: { tobacco: 'yes' } }).audience, 'general')
  assert.equal(getPersonalizedAudience(base, { answers: { tobacco: 'yes' } }).generalWarnings.length, 1)
  assert.equal(getPersonalizedAudience(base, { answers: {} }).audience, 'general')
  assert.equal(getPersonalizedAudience({ has_completed_assessment: false }, null, { chronic_condition: 'โรคหอบหืด' }).audience, 'sensitive')
  assert.equal(getPersonalizedAudience({ has_completed_assessment: false }, null).audience, 'unknown')
})

test('clinical guidance is qualitative and marked pending review', () => {
  const guidance = getClinicalGuidancePlaceholder()
  assert.equal(guidance.status, 'pending_review')
  assert.equal(guidance.items.length, 3)
})

assert.equal(PM25_THRESHOLD_SETS.thai_2566.entries[3].min_inclusive, 37.6)
