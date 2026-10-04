// Timeout Cleanup Test (Phase 6) — ทดสอบ timeout จริงของ runner ที่ระดับ lib
// หลักการ: ห้ามลด production timeout เพื่อให้ test ผ่าน → lib อ่าน env VITALSIGNS_TIMEOUT_MS
// (default 150s สำหรับ production) และ test นี้ตั้ง env เฉพาะ process ของตัวเองเป็น 4s
// แล้วป้อนวิดีโอที่ใช้เวลาประมวลผลนานกว่านั้น → ต้อง kill process และคืน error timeout
// รัน: VITALSIGNS_FFMPEG_BIN=<admin-app/server/bin> node --test tests/runner-timeout-cleanup.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const FFMPEG_DIR = process.env.VITALSIGNS_FFMPEG_BIN
  || String.raw`C:\Users\ACER\projectweb\admin-app\server\bin`
const FFMPEG = path.join(FFMPEG_DIR, 'ffmpeg.exe')

// ตั้ง timeout ระดับ test process = 3 วินาที (production ยัง 150s — env เป็น config ปกติของ lib)
process.env.VITALSIGNS_TIMEOUT_MS = '3000'
process.env.VITALSIGNS_FFMPEG_BIN = FFMPEG_DIR

const { runVitalSigns } = await import('../../admin-app/src/lib/vitalSigns.ts')

const WORK_DIR = path.join(tmpdir(), 'runner-timeout-test')
await rm(WORK_DIR, { recursive: true, force: true })
await mkdir(WORK_DIR, { recursive: true })

// วิดีโอ 85 วินาที (< ขีดจำกัด 90s จึงผ่าน duration gate) ที่ 640x480@25fps = 2,125 เฟรม
// → normalize + rPPG บน CPU ยาวกว่า 3 วินาทีแน่นอนทุกเครื่อง → ชน timeout ของ test process แบบ deterministic
const videoPath = path.join(WORK_DIR, 'slow85.mp4')
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'lavfi',
  '-i', 'testsrc=duration=85:size=640x480:rate=25', '-pix_fmt', 'yuv420p', videoPath])

test('Timeout จริง: process tree ถูก kill และคืน error timeout ภายใน ~3s (ไม่รอ 150s)', async () => {
  const started = Date.now()
  const result = await runVitalSigns(videoPath)
  const elapsed = Date.now() - started
  assert.equal(result.ok, false)
  assert.match(result.error, /timed out after 3000ms/)
  assert.ok(elapsed >= 2800 && elapsed < 20000, `ต้องตัดจริงราว ๆ 3s ไม่ใช่รอเต็มเวลา (ใช้จริง ${elapsed}ms)`)
}, { timeout: 60000 })

test('หลัง timeout kill ทั้ง tree: ไฟล์ที่ ffmpeg orphan เคยถือถูกปลดล็อก (ลบได้ภายในไม่กี่วินาที)', async () => {
  // เรียกอีกครั้งเพื่อให้เกิด orphan จริง แล้ว tree-kill ต้องเก็บกวาด
  const second = await runVitalSigns(videoPath)
  assert.equal(second.ok, false)
  assert.match(second.error, /timed out after 3000ms/)

  // poll จนไฟล์/โฟลเดอร์ถูกปลดล็อก (taskkill ทำงาน async) — ภายใน 10 วินาที
  const deadline = Date.now() + 10_000
  let removed = false
  while (Date.now() < deadline) {
    try {
      await rm(WORK_DIR, { recursive: true, force: true })
      // ยืนยันว่าลบได้จริง (ไม่ EBUSY): ลองอ่านซ้ำ
      await rm(WORK_DIR, { recursive: true, force: true })
      removed = true
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  assert.ok(removed, 'temp ต้องลบได้ภายใน 10s หลัง tree-kill (ไม่มี ffmpeg orphan ถือไฟล์ค้าง)')
}, { timeout: 60000 })
