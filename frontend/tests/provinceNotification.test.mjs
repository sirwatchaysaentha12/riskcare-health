import test from 'node:test'
import assert from 'node:assert/strict'
import { notifiedKeyToday, shouldNotifyProvinceAlert } from '../src/utils/provinceNotification.js'

test('general users are notified only from the health-impact level (≥37.6)', () => {
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'very_good', isSensitive: false, alreadyNotifiedToday: false }), false)
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'good', isSensitive: false, alreadyNotifiedToday: false }), false)
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'moderate', isSensitive: false, alreadyNotifiedToday: false }), false)
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'health_impact_start', isSensitive: false, alreadyNotifiedToday: false }), true)
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'health_impact', isSensitive: false, alreadyNotifiedToday: false }), true)
})

test('sensitive users are notified earlier from the moderate level (≥25.1)', () => {
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'moderate', isSensitive: true, alreadyNotifiedToday: false }), true)
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'health_impact_start', isSensitive: true, alreadyNotifiedToday: false }), true)
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'good', isSensitive: true, alreadyNotifiedToday: false }), false)
})

test('no repeat notification on the same day for the same province and level', () => {
  assert.equal(shouldNotifyProvinceAlert({ levelCode: 'health_impact_start', isSensitive: false, alreadyNotifiedToday: true }), false)
})

test('missing level or malformed input never notifies', () => {
  assert.equal(shouldNotifyProvinceAlert({ levelCode: undefined, isSensitive: false, alreadyNotifiedToday: false }), false)
  assert.equal(shouldNotifyProvinceAlert({ levelCode: '', isSensitive: true, alreadyNotifiedToday: false }), false)
})

test('notified key is scoped by province, level and Bangkok calendar day', () => {
  const key = notifiedKeyToday('เชียงใหม่', 'moderate')
  assert.match(key, /^riskcare_notified_เชียงใหม่_moderate_\d{4}-\d{2}-\d{2}$/)
})
