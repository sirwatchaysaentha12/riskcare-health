import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateTrend, generateAlertMessage } from '../src/lib/pm25Trend.ts'

const mk = (values) => values.map((pm25, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, pm25 }))

test('trend: increasing when the latest 3-day average is more than 10% above the previous', () => {
  const result = calculateTrend(mk([10, 10, 10, 20, 22, 21]))
  assert.equal(result.trend, 'increasing')
  assert.equal(result.previousAvg, 10)
  assert.equal(result.latestAvg, 21)
  assert.equal(result.dataPointsUsed, 6)
})

test('trend: decreasing when the latest 3-day average is more than 10% below the previous', () => {
  const result = calculateTrend(mk([20, 20, 20, 10, 10, 10]))
  assert.equal(result.trend, 'decreasing')
  assert.equal(result.previousAvg, 20)
  assert.equal(result.latestAvg, 10)
})

test('trend: stable when the change stays within ±10%', () => {
  const result = calculateTrend(mk([20, 20, 20, 21, 20, 20]))
  assert.equal(result.trend, 'stable')
})

test('trend: insufficient_data with fewer than 6 data points', () => {
  const result = calculateTrend(mk([10, 11, 12, 11, 10]))
  assert.equal(result.trend, 'insufficient_data')
  assert.equal(result.dataPointsUsed, 5)
  assert.equal(result.latestAvg, null)
})

test('trend: uses only the latest 6 points when more data exists', () => {
  // 8 จุด: ค่า 100 ในอดีตต้องไม่มีผล — ใช้ 6 จุดท้าย (10 ทั้งหมด) = stable
  const result = calculateTrend(mk([100, 100, 10, 10, 10, 10, 10, 10]))
  assert.equal(result.trend, 'stable')
  assert.equal(result.previousAvg, 10)
  assert.equal(result.latestAvg, 10)
})

test('alert: rising dust warns the at-risk group harder (ยาพ่น) than the general group', () => {
  const rising = calculateTrend(mk([10, 10, 10, 20, 22, 21]))
  const sensitive = generateAlertMessage(rising, { audience: 'sensitive' })
  const general = generateAlertMessage(rising, { audience: 'general' })
  assert.match(sensitive, /ยาพ่น|ยาประจำตัว/)
  assert.match(sensitive, /กลุ่มเสี่ยง/)
  assert.doesNotMatch(general, /ยาพ่น|กลุ่มเสี่ยง/)
  assert.match(general, /เพิ่มขึ้น/)
})

test('alert: insufficient_data says plainly that data is not enough for forecasting', () => {
  const message = generateAlertMessage(calculateTrend(mk([10, 11, 12, 11, 10])), null)
  assert.match(message, /ยังไม่เพียงพอ/)
})
