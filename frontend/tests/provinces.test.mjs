import test from 'node:test'
import assert from 'node:assert/strict'
import { THAI_PROVINCES, UNIQUE_THAI_PROVINCES } from '../src/data/thaiProvinces.js'
import { THAI_DISTRICTS, getDistrictNames } from '../src/data/thaiDistricts.js'
import { createProvinceDustQuery, createProvinceProfileUpdate, getProvinceFallbackState } from '../src/utils/provinceProfile.js'

test('มีรายชื่อจังหวัดไทยครบ 77 จังหวัดและไม่ซ้ำกัน', () => {
  assert.equal(THAI_PROVINCES.length, 77)
  assert.equal(UNIQUE_THAI_PROVINCES.length, 77)
  assert.ok(UNIQUE_THAI_PROVINCES.every((province) => province.trim().length > 0))
})

test('Master Data มีรายชื่ออำเภอจริงครบทั้ง 77 จังหวัด', () => {
  assert.equal(Object.keys(THAI_DISTRICTS).length, 77)
  for (const province of UNIQUE_THAI_PROVINCES) {
    const districts = getDistrictNames(province)
    assert.ok(districts.length > 0, `missing districts for ${province}`)
    assert.equal(new Set(districts).size, districts.length)
    assert.ok(districts.every((district) => !district.includes('อำเภอหลัก')))
  }
  assert.equal(getDistrictNames('พิจิตร').length, 12)
})

test('บันทึกและส่งค่าจังหวัดต่อระบบฝุ่นได้ครบทุกจังหวัด', () => {
  for (const province of UNIQUE_THAI_PROVINCES) {
    const profile = createProvinceProfileUpdate(province)
    const query = createProvinceDustQuery(profile.province)
    assert.equal(profile.province, province)
    assert.equal(query.province, province)
    assert.equal(typeof query.fallback, 'string')
    assert.doesNotThrow(() => JSON.stringify({ profile, query }))
  }
})

test('แสดงสถานะ fallback เมื่อจังหวัดไม่มีข้อมูลสถานี', () => {
  assert.equal(getProvinceFallbackState([]), 'no-station-data')
  assert.equal(getProvinceFallbackState([{ name: 'สถานีทดสอบ', pm25: 12 }]), 'ready')
  assert.equal(getProvinceFallbackState(null), 'no-station-data')
})
