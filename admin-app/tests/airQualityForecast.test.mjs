import test from 'node:test'
import assert from 'node:assert/strict'
import { buildForecast } from '../src/lib/airQualityForecast.ts'

const mk = (values) => values.map((pm25, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, pm25 }))

test('forecast: not built from fewer than 3 real data points (no fake forecasts)', () => {
  assert.deepEqual(buildForecast(mk([10, 11]), 3), [])
  assert.deepEqual(buildForecast([], 3), [])
})

test('forecast: 3 days from the same history, marked derived/forecast', () => {
  const forecast = buildForecast(mk([10, 10, 10, 10, 10, 10, 10]), 3)
  assert.equal(forecast.length, 3)
  for (const point of forecast) {
    assert.equal(point.isForecast, true)
    assert.equal(point.dataSource, 'derived')
    assert.equal(point.confidence, 'medium')
    assert.equal(point.unit, 'µg/m³')
    assert.ok(point.value > 0)
    assert.ok(point.status && point.advice)
  }
})

test('forecast: blend formula = 0.7 × ค่าล่าสุด + 0.3 × MA7 (ตรงตามที่วัดบน holdout)', () => {
  // ประวัติ 8 จุด: last = 30, MA7 = (10+10+10+10+10+10+30)/7 = 12.857…
  // blend = 0.7×30 + 0.3×12.857… = 24.857… → ปัดเป็น 24.9
  const forecast = buildForecast(mk([10, 10, 10, 10, 10, 10, 10, 30]), 3)
  assert.equal(forecast[0].value, 24.9)
  // ทำนายทั้ง 3 วันจาก origin เดียวกัน — ค่าเท่ากันทุกวัน
  assert.deepEqual(forecast.map((point) => point.value), [24.9, 24.9, 24.9])
  // ค่าอยู่ระหว่าง persistence (30) กับ MA7 (12.86) เสมอ
  assert.ok(forecast[0].value < 30 && forecast[0].value > 12.85)
})

test('forecast: history สั้นกว่า 7 วัน → MA7 fallback เป็นค่าล่าสุด (= persistence)', () => {
  const forecast = buildForecast(mk([10, 10, 10, 10, 10, 30]), 3)
  // last = 30, มี 6 จุด (<7) → ma7 = 30 → blend = 30
  assert.equal(forecast[0].value, 30)
})

test('forecast: values never go below zero even with a steep drop', () => {
  const forecast = buildForecast(mk([8, 8, 8, 0.1, 0.1, 0.1]), 3)
  for (const point of forecast) assert.ok(point.value >= 0)
})

test('forecast: low confidence with 3-6 data points, medium from 7', () => {
  assert.equal(buildForecast(mk([10, 12, 11]), 3)[0].confidence, 'low')
  assert.equal(buildForecast(mk([10, 12, 11, 12, 10, 11]), 3)[0].confidence, 'low')
  assert.equal(buildForecast(mk([10, 12, 11, 12, 10, 11, 12]), 3)[0].confidence, 'medium')
})
