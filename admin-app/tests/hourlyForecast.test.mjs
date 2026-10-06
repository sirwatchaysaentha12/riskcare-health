import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHourlyPersistenceForecast, HOURLY_MEASURED_ACCURACY, HOURLY_MODEL_VERSION } from '../src/lib/hourlyForecast.ts'

const NOW = Date.parse('2026-10-06T10:00:00Z')
const pt = (hoursAgo, pm25) => ({ tsUtc: new Date(NOW - hoursAgo * 3600_000).toISOString(), pm25 })

test('hourly persistence: ไม่มีค่าวัดจริง = ไม่มีการพยากรณ์ (ห้ามเดาค่าว่าง)', () => {
  assert.equal(buildHourlyPersistenceForecast([], NOW), null)
  assert.equal(buildHourlyPersistenceForecast([{ tsUtc: '', pm25: NaN }], NOW), null)
  assert.equal(buildHourlyPersistenceForecast([{ tsUtc: new Date(NOW).toISOString(), pm25: -3 }], NOW), null)
})

test('hourly persistence: ทำนาย 1/2/3 ชม. จากค่าวัดล่าสุด แท็ก forecast + modelVersion ครบ', () => {
  const r = buildHourlyPersistenceForecast([pt(5, 12.3), pt(2, 18.4), pt(1, 20.6)], NOW)
  assert.equal(r.observed.pm25, 20.6)
  assert.equal(r.forecast.length, 3)
  assert.deepEqual(r.forecast.map((p) => p.horizonHours), [1, 2, 3])
  for (const p of r.forecast) {
    assert.equal(p.pm25, 20.6)                 // persistence = ค่าล่าสุดคงที่ทุก horizon
    assert.equal(p.dataType, 'forecast')
    assert.equal(p.modelVersion, HOURLY_MODEL_VERSION)
    assert.equal(Date.parse(p.timeUtc) - Date.parse(r.observed.timeUtc), p.horizonHours * 3600_000)
  }
  assert.equal(r.stale, false)
})

test('hourly persistence: ค่าวัดเก่าเกิน 3 ชม. = stale (ต้องแจ้งเตือน ไม่หลอกว่าสด)', () => {
  const r = buildHourlyPersistenceForecast([pt(4, 30)], NOW)
  assert.equal(r.stale, true)
})

test('hourly persistence: ค่า negative/NaN ถูกกรองทิ้ง ใช้ค่าจริงตัวก่อนหน้า', () => {
  const r = buildHourlyPersistenceForecast([pt(3, 15), pt(2, NaN), pt(1, -1)], NOW)
  assert.equal(r.observed.pm25, 15)
  assert.equal(r.forecast.every((p) => p.pm25 === 15), true)
})

test('accuracy metadata: ทุก horizon ผ่านเป้า ±2 และ ±3 >= 87-90%', () => {
  for (const h of [1, 2, 3]) {
    const acc = HOURLY_MEASURED_ACCURACY.byHorizon[h]
    assert.ok(acc['±2'] >= 87, `h=${h} ±2=${acc['±2']}`)
    assert.ok(acc['±3'] >= 87, `h=${h} ±3=${acc['±3']}`)
    assert.ok(acc['±2'] <= acc['±3'])          // monotonicity
    assert.ok(acc.N > 20000)
  }
})
