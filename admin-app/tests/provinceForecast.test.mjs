import test from 'node:test'
import assert from 'node:assert/strict'
import { selectProvinceForecast, isProvinceSupported } from '../src/lib/provinceForecast.ts'

const PROV = 'กรุงเทพมหานคร'
const SUPPORTED = [PROV]
const row = (target, issued, horizon, pm25) => ({ province: PROV, target_date: target, issued_date: issued, horizon, pm25 })

const TODAY = '2026-10-08'
const T1 = '2026-10-09', T2 = '2026-10-10', T3 = '2026-10-11'
const YDAY = '2026-10-07'

test('ปกติ: รอบวันนี้ครบ 3 horizon → state ok', () => {
  const rows = [row(T1, TODAY, 1, 20), row(T2, TODAY, 2, 21), row(T3, TODAY, 3, 22)]
  const sel = selectProvinceForecast(rows, { province: PROV, today: TODAY, supportedProvinces: SUPPORTED })
  assert.equal(sel.state, 'ok')
  assert.equal(sel.items.length, 3)
  assert.equal(sel.latestIssue, TODAY)
})

test('กันหน้าว่าง #1 — ขาดข้อมูลเมื่อวาน: +2 ของเมื่อวานยังใช้เป็น +1 ของวันนี้ได้ (target ตรงกัน)', () => {
  // วันนี้ pipeline ล้ม (ไม่มี issued TODAY) — เมื่อวานออก target T1(h2) กับ T3(h3) มา
  const rows = [row(T1, YDAY, 2, 19.5), row(T3, YDAY, 3, 23)]
  const sel = selectProvinceForecast(rows, { province: PROV, today: TODAY, supportedProvinces: SUPPORTED })
  assert.equal(sel.state, 'stale')
  assert.ok(sel.items.length >= 1, 'ต้องมีอย่างน้อย 1 รายการ — ห้ามว่าง')
  assert.equal(sel.latestIssue, YDAY)
  assert.ok(sel.message.includes(YDAY), 'ต้องบอกว่าออกเมื่อวันไหน')
  // target T1 ต้องถูกเสนอ (จาก +2 เมื่อวาน)
  assert.ok(sel.items.some((i) => i.targetDate === T1))
})

test('กันหน้าว่าง #2 — จังหวัดไม่รองรับ: state unsupported + เหตุผล (ไม่ยืมค่าจังหวัดอื่น)', () => {
  const sel = selectProvinceForecast([row(T1, TODAY, 1, 20)], { province: 'เชียงใหม่', today: TODAY, supportedProvinces: SUPPORTED })
  assert.equal(sel.state, 'unsupported')
  assert.equal(sel.items.length, 0)
  assert.ok(sel.message.length > 10)
  assert.equal(isProvinceSupported('เชียงใหม่', SUPPORTED), false)
  assert.equal(isProvinceSupported(PROV, SUPPORTED), true)
})

test('กันหน้าว่าง #3 — รอบล้มเหลวทั้งหมด (ไม่มีแถวเลย): state no_data + ข้อความ ไม่ใช่ empty เงียบ ๆ', () => {
  const sel = selectProvinceForecast([], { province: PROV, today: TODAY, supportedProvinces: SUPPORTED })
  assert.equal(sel.state, 'no_data')
  assert.ok(sel.message.length > 10)
})

test('stale แบบไม่ครบ: มีบาง horizon จากบางวัน → ยังแสดงสิ่งที่มี + บอกอายุ', () => {
  const rows = [row(T1, TODAY, 1, 20), row(T2, YDAY, 1, 21)]  // T2 มาจาก h1 เมื่อวาน (target ตรง)
  const sel = selectProvinceForecast(rows, { province: PROV, today: TODAY, supportedProvinces: SUPPORTED })
  assert.equal(sel.state, 'stale')
  assert.ok(sel.items.length >= 1)
  const t2 = sel.items.find((i) => i.targetDate === T2)
  assert.ok(t2, 'T2 ต้องถูกแสดงจาก fallback')
  assert.equal(t2.ageDays, 1)
})

test('ageDays นับถูก + ค่า pm25 เป็นตัวเลข', () => {
  const rows = [row(T1, TODAY, 1, '20.5')]
  const sel = selectProvinceForecast(rows, { province: PROV, today: TODAY, supportedProvinces: SUPPORTED })
  assert.equal(sel.items[0].pm25, 20.5)
  assert.equal(sel.items[0].ageDays, 0)
})
