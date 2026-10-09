// ตรวจความพร้อมวันแข่ง (Demo day readiness) — v1.0 · 1 ต.ค. 2026
// ตรวจ: ไฟล์โมเดล MediaPipe ครบ, backend ตอบได้, snapshot มีอยู่, build ผ่าน
// ใช้: npm run demo-check [-- --skip-build]
import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(process.cwd())
const ADMIN = resolve(ROOT, '..', 'admin-app')
const checks = []
let failures = 0

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('=== Demo Day Readiness Check ===\n')

// 1) ไฟล์โมเดล MediaPipe ใน public
const mp = resolve(ROOT, 'public', 'mediapipe')
const requiredFiles = [
  'pose_landmarker_lite.task',
  'vision_bundle.mjs',
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm',
]
for (const file of requiredFiles) {
  const path = resolve(mp, file)
  const ok = existsSync(path) && statSync(path).size > 1000
  check(`MediaPipe: ${file}`, ok, ok ? `${Math.round(statSync(path).size / 1024)} KB` : 'ไม่พบไฟล์ — รันคำสั่งดาวน์โหลดใน docs อีกครั้ง')
}

// 2) snapshot ฝั่ง backend
for (const file of ['air4thai.snapshot.json', 'dustboy.snapshot.json', 'stations-cache.json']) {
  const path = resolve(ADMIN, 'server', 'data', file)
  check(`Snapshot: ${file}`, existsSync(path), existsSync(path) ? `${Math.round(statSync(path).size / 1024)} KB` : 'ไม่พบ — รัน backend ครั้งแรกเพื่อสร้าง')
}

// 3) backend ตอบได้
try {
  const response = await fetch('http://localhost:3000/api/stations?lat=13.73&lon=100.48', { signal: AbortSignal.timeout(30000) })
  const body = await response.json()
  check('Backend :3000 /api/stations', response.ok && body.stations?.length > 0, `HTTP ${response.status} · state=${body.state} · ${body.stations?.length ?? 0} สถานี · meta=${JSON.stringify(body.meta ?? {})}`)
} catch (error) {
  check('Backend :3000 /api/stations', false, `เรียกไม่ได้: ${error.message} — รัน npm run dev ใน admin-app`)
}

// 4) build ผ่าน (ข้ามได้ด้วย --skip-build เมื่อเพิ่ง build แล้ว)
if (!process.argv.includes('--skip-build')) {
  console.log('\nกำลัง build frontend (npm run build)…')
  try {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' })
    check('Frontend build (vite)', true, 'dist สร้างสำเร็จ')
  } catch (error) {
    check('Frontend build (vite)', false, error.message?.slice(0, 200))
  }
} else {
  console.log('\n(ข้าม build ตาม --skip-build)')
}

console.log(`\n=== สรุป: ${checks.length - failures}/${checks.length} ผ่าน ===`)
if (failures > 0) {
  console.log('มีรายการไม่ผ่าน — แก้ตามรายละเอียดข้างบนก่อนวันแข่ง')
  process.exit(1)
}
console.log('พร้อมวันแข่ง ✓ (อย่าลืม: คลิปตัวอย่างวางที่ public/demo/sample-breathing.mp4 ถ้าต้องการโหมด Demo คลิป)')
