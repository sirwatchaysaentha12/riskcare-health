// ทดสอบ fallback ของ fetchStationsPart: upstream ล้ม → cache ไฟล์ → snapshot — v1.0 · 1 ต.ค. 2026
// รัน: node --import ./scripts/register-ts-aliases.mjs --test tests/stationsFallback.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchStationsPart } from '../src/lib/upstreamStations.ts'

// หมายเหตุ: ตัว helper ใช้ CACHE_FILE คงที่ที่ process.cwd()/server/data — เทสต์นี้จึงโฟกัส
// "upstream ล้ม → ต้องตอบจาก snapshot เสมอ ไม่ throw" ซึ่งเป็นพฤติกรรมการการันตีหลัก
const failingFetch = async () => { throw new Error('Upstream HTTP 500') }

test('upstream ล้ม และไม่มี cache → ต้องตอบ snapshot พร้อม stale=true ไม่ throw', async () => {
  const part = await fetchStationsPart('dustboy', { url: 'https://example.invalid/stations', fetchJson: failingFetch, retries: 0 })
  assert.equal(part.source, 'snapshot')
  assert.equal(part.stale, true)
  assert.ok(part.error)
  assert.ok(part.data && typeof part.data === 'object')
})

test('air4thai upstream ล้ม → ต้องตอบจาก cache หรือ snapshot (stale) พร้อมข้อมูลสถานีจริง > 100 แห่ง', async () => {
  const part = await fetchStationsPart('air4thai', { url: 'https://example.invalid/stations', fetchJson: failingFetch, retries: 0 })
  // ลำดับชั้น: cache ไฟล์ล่าสุดก่อน (ถ้า backend เคยรันแล้ว) แล้วค่อย snapshot — ทั้งคู่ stale=true
  assert.ok(['cache', 'snapshot'].includes(part.source), `source ควรเป็น cache/snapshot (ได้ ${part.source})`)
  assert.equal(part.stale, true)
  const stations = part.data?.stations
  assert.ok(Array.isArray(stations) && stations.length > 100, `ควรมีสถานีจริง > 100 แห่ง (ได้ ${stations?.length})`)
})

test('upstream สำเร็จ (fetch จำลอง) → ต้องได้ source=live stale=false', async () => {
  const livePayload = { stations: [{ stationID: 't1', nameTH: 'ทดสอบ' }] }
  const part = await fetchStationsPart('air4thai', { url: 'https://example.invalid/stations', fetchJson: async () => livePayload, retries: 0 })
  assert.equal(part.source, 'live')
  assert.equal(part.stale, false)
  assert.ok(part.updatedAt)
  // เก็บกวาด: test นี้เขียน cache จำลอง 1 สถานีลงไฟล์ cache จริง — ต้องลบทิ้ง
  // ไม่งั้นรอบถัดไป test "สถานี > 100 แห่ง" จะอ่าน cache ปลอมแล้วล้ม (self-poisoning)
  rmSync(join(process.cwd(), 'server', 'data', 'stations-cache.json'), { force: true })
})
