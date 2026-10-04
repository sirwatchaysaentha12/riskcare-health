// Security tests — POST /api/vital-signs (backend ต้องรันอยู่ที่ :3000)
// ครอบคลุม: MIME ปลอม / extension+path traversal+shell injection ในชื่อไฟล์ /
// ไฟล์ใหญ่เกิน / วิดีโอยาวเกิน / ไฟล์เสีย / temp cleanup / error redaction / duplicate request
// รัน: node tests/api-vital-signs-security.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ENDPOINT = 'http://127.0.0.1:3000/api/vital-signs'
const FFMPEG = String.raw`C:\Users\ACER\projectweb\admin-app\server\bin\ffmpeg.exe`
const FIXTURE_DIR = path.join(tmpdir(), 'vital-signs-security-fixtures')

// เตรียม/เก็บกวาด fixture dir ระดับโมดูล
await rm(FIXTURE_DIR, { recursive: true, force: true })
await mkdir(FIXTURE_DIR, { recursive: true })
process.on('exit', () => { rm(FIXTURE_DIR, { recursive: true, force: true }).catch(() => {}) })

const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])

async function postForm(filename, bytes) {
  const form = new FormData()
  form.append('video', new Blob([bytes]), filename)
  const response = await fetch(ENDPOINT, { method: 'POST', body: form })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}

async function countVitalSignsTempDirs() {
  const entries = await readdir(tmpdir())
  return entries.filter((name) => name.startsWith('vital-signs-')).length
}

test('MIME ปลอม (text แต่ตั้งชื่อ .mp4) → 415 ไม่ประมวลผล', async () => {
  const fake = Buffer.from('this is definitely not a video file, just plain text '.repeat(20))
  const { status, body } = await postForm('video.mp4', fake)
  assert.equal(status, 415)
  assert.equal(body.ok, false)
  assert.match(body.error, /unsupported video content/)
})

test('Extension แปลก + path traversal + shell injection ในชื่อไฟล์ → server เมินชื่อไฟล์ (ตัดสินจากเนื้อไฟล์), ไม่มี path หลุด', async () => {
  // เนื้อไฟล์ = webm จริง (magic) + garbage → ผ่าน detection แต่ decode ล้มเหลว → error แบบ redacted
  const bytes = Buffer.concat([WEBM_MAGIC, Buffer.alloc(2048, 7)])
  const maliciousName = '..\\..\\..\\windows\\evil; rm -rf ~ ;`.mp4'
  const { status, body } = await postForm(maliciousName, bytes)
  assert.equal(status, 200) // soft failure ไม่ใช่ server error
  assert.equal(body.ok, false)
  const serialized = JSON.stringify(body)
  assert.ok(!serialized.includes('evil'), 'response ต้องไม่กล่าวถึงชื่อไฟล์ client')
  assert.ok(!serialized.includes('\\windows'), 'response ต้องไม่มี path')
  assert.match(body.error, /broken or undecodable video/)
})

test('ไฟล์ใหญ่เกิน 60MB → 413', async () => {
  const big = Buffer.concat([WEBM_MAGIC, Buffer.alloc(61 * 1024 * 1024, 0)])
  const { status, body } = await postForm('big.mp4', big)
  assert.equal(status, 413)
  assert.match(body.error, /too large/)
})

test('วิดีโอยาวเกิน 90 วินาที → ok:false "video too long" (duration limit)', async () => {
  const longPath = path.join(FIXTURE_DIR, 'long120.mp4')
  await rm(longPath, { force: true })
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc=duration=120:size=320x240:rate=10', '-pix_fmt', 'yuv420p', longPath])
  const bytes = await readFile(longPath)
  const { status, body } = await postForm('long.mp4', bytes)
  assert.equal(status, 200)
  assert.equal(body.ok, false)
  assert.match(body.error, /video too long/)
}, { timeout: 180000 })

test('ไฟล์เสีย (magic ถูกแต่ decode ไม่ได้) → ok:false และ error ไม่เผย local path', async () => {
  const bytes = Buffer.concat([WEBM_MAGIC, Buffer.alloc(4096, 0x42)])
  const { status, body } = await postForm('broken.webm', bytes)
  assert.equal(status, 200)
  assert.equal(body.ok, false)
  assert.match(body.error, /broken or undecodable video/)
  assert.ok(!/[A-Za-z]:\\/.test(body.error), `error ต้องไม่มี Windows path: ${body.error}`)
  assert.ok(!body.error.includes(tmpdir()), 'error ต้องไม่เผย temp dir')
})

test('Path traversal ผ่านชื่อไฟล์ไม่สร้างไฟล์นอก temp dir (server ตั้งชื่อเอง)', async () => {
  const before = await countVitalSignsTempDirs()
  const bytes = Buffer.concat([WEBM_MAGIC, Buffer.alloc(1024, 1)])
  await postForm('../../outside.mp4', bytes)
  // รอ cleanup ใน finally ทำงาน
  await new Promise((resolve) => setTimeout(resolve, 500))
  const after = await countVitalSignsTempDirs()
  assert.equal(after, before, 'temp dir ต้องถูกลบครบหลัง response (cleanup ทุกกรณี)')
})

test('Temp cleanup หลังทุก request (สะสมหลายคำขอก็ไม่ค้าง)', async () => {
  const before = await countVitalSignsTempDirs()
  const bytes = Buffer.concat([WEBM_MAGIC, Buffer.alloc(1024, 3)])
  await postForm('a.mp4', bytes)
  await postForm('b.mp4', bytes)
  await postForm('c.mp4', bytes)
  await new Promise((resolve) => setTimeout(resolve, 800))
  const after = await countVitalSignsTempDirs()
  assert.equal(after, before, `temp dirs ควรกลับมาเท่าเดิม (before=${before}, after=${after})`)
})

test('Duplicate request (ยิงพร้อมกัน 3 คำขอ) → ตอบอิสระต่อกันครบทุกคำขอ', async () => {
  const bytes = Buffer.concat([WEBM_MAGIC, Buffer.alloc(2048, 5)])
  const requests = [1, 2, 3].map((i) => postForm(`dup${i}.mp4`, bytes))
  const results = await Promise.all(requests)
  for (const result of results) {
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, false) // ไฟล์เสีย → soft failure ทุกคำขอ
    assert.match(result.body.error, /broken or undecodable video/)
  }
})

test('Missing file field → 400; GET/OPTIONS ไม่พัง', async () => {
  const form = new FormData()
  const response = await fetch(ENDPOINT, { method: 'POST', body: form })
  assert.equal(response.status, 400)
  const options = await fetch(ENDPOINT, { method: 'OPTIONS' })
  assert.equal(options.status, 204)
})
