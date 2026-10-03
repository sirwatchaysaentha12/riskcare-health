import test from 'node:test'
import assert from 'node:assert/strict'
import { pm25Status } from '../src/lib/pm25Status.ts'

test('general users get the standard PCD 2566 advice', () => {
  assert.equal(pm25Status(10).advice, 'ทำกิจกรรมกลางแจ้งได้ตามปกติ')
  assert.equal(pm25Status(30).advice, 'ลดกิจกรรมกลางแจ้งที่ใช้แรงมาก')
  assert.equal(pm25Status(50).advice, 'ลด/เลี่ยงกิจกรรมกลางแจ้ง และสวมหน้ากากป้องกัน PM2.5')
})

test('sensitive users get stricter, group-specific advice at the same PM2.5 value', () => {
  const general = pm25Status(10)
  const sensitive = pm25Status(10, true)
  assert.equal(sensitive.status, general.status) // ระดับเดียวกัน
  assert.notEqual(sensitive.advice, general.advice) // แต่คำแนะนำเข้มขึ้นสำหรับกลุ่มเสี่ยง
  assert.match(sensitive.advice, /กลุ่มเสี่ยง|กลุ่มเสี่ยงควร/)
  // ทุกระดับ: คำแนะนำกลุ่มเสี่ยงต้องต่างจากทั่วไป (ยกเว้นเท่ากันได้ถ้าเนื้อความครอบคลุม)
  for (const value of [10, 20, 30, 50, 100]) {
    const s = pm25Status(value, true).advice
    assert.ok(s.length > 0)
    assert.notEqual(s, undefined)
    assert.ok(s.includes('กลุ่มเสี่ยง') || s.includes('แพทย์'), `value=${value}: ${s}`)
  }
})

test('level (tier label) stays identical for both audiences at the same value', () => {
  for (const value of [10, 20, 30, 50, 100]) {
    assert.equal(pm25Status(value).level, pm25Status(value, true).level)
  }
})

test('invalid values return null regardless of audience', () => {
  assert.equal(pm25Status(-1), null)
  assert.equal(pm25Status(NaN, true), null)
})
