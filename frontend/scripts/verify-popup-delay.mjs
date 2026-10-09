// ทดสอบจริงขั้นสุดท้าย (user สั่งยืนยัน): ทำแบบประเมิน 14 ข้อ → กดดูผล →
// ยืนยันว่า popup (AssessmentResultModal) เด้ง "หลัง delay" ไม่ใช่ทันที
// รัน: DEMO_TEST_PASSWORD=... node scripts/verify-popup-delay.mjs  (ต้องเปิด dev server 5173)
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const EMAIL = 'e2e-breath@test.local'
const PASSWORD = process.env.DEMO_TEST_PASSWORD
if (!PASSWORD) {
  console.error('SAFE ERROR: DEMO_TEST_PASSWORD is required')
  process.exit(1)
}

const results = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['geolocation'],
  geolocation: { latitude: 13.7563, longitude: 100.5018 },
})
const page = await context.newPage()

try {
  // ล็อกอิน
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-identifier', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), { timeout: 15000 })
  record('ล็อกอิน', true, page.url())

  // เข้าหน้าแบบประเมิน
  await page.goto(`${BASE}/assessment`, { waitUntil: 'domcontentloaded' })
  await page.locator('.assessment-form').waitFor({ timeout: 15000 })
  record('หน้าแบบประเมินโหลด', true)

  // ตอบคำถามครบ 14 ข้อ (เลือกตัวเลือกที่ 2 ของทุกข้อ — สั้นและครบ)
  const questionCards = page.locator('.question-card')
  const questionCount = await questionCards.count()
  for (let index = 0; index < questionCount; index++) {
    await questionCards.nth(index).locator('label').nth(1).click()
  }
  record('ตอบคำถามครบ', questionCount === 14, `questions=${questionCount}`)

  // เลือกภาค + จังหวัด
  await page.locator('.assessment-location-grid select').nth(0).selectOption({ index: 1 })
  await page.waitForTimeout(300)
  await page.locator('.assessment-location-grid select').nth(1).selectOption({ index: 1 })
  record('เลือกภาค/จังหวัด', true)

  // กดดูผล → จับเวลา: คลิก → overlay กำลังประมวลผล → modal
  const modal = page.locator('.result-modal')
  const overlay = page.locator('.processing-overlay')
  const t0 = Date.now()

  await page.getByRole('button', { name: /ดูผลการประเมิน/ }).click()

  // ตรวจช่วง delay: ที่ +800ms หลังคลิก ต้องยังไม่มี modal (ถ้า DB save เร็ว — delay 1.8s ต้องกันไว้)
  let overlayDuringDelay = false
  await page.waitForTimeout(800)
  overlayDuringDelay = (await overlay.count()) > 0 && (await modal.count()) === 0
  const snapshotAt800ms = { overlay: (await overlay.count()) > 0, modal: (await modal.count()) > 0 }

  await modal.waitFor({ timeout: 30000 })
  const tModal = Date.now()
  const elapsedMs = tModal - t0
  record('popup เด้งหลัง delay (>=1.5 วิ) ไม่ใช่ทันที', elapsedMs >= 1500, `${elapsedMs}ms`)
  record('ระหว่าง delay หน้า "กำลังประมวลผล" แสดง + ยังไม่มี popup', overlayDuringDelay, JSON.stringify(snapshotAt800ms))

  const modalText = await modal.innerText()
  const hasZoneChip = (await modal.locator('.result-modal-zone-chip').count()) === 1
  record('popup สถานะสุขภาพแสดง zone chip สี', hasZoneChip, modalText.replace(/\n/g, ' | ').slice(0, 140))
  await page.screenshot({ path: String.raw`C:\Users\ACER\web-screens\popup-delay-final.png`, fullPage: false })
} catch (error) {
  record('UNEXPECTED ERROR', false, String(error).slice(0, 400))
} finally {
  await browser.close()
}

writeFileSync(String.raw`C:\Users\ACER\projectweb\tmp-vitallens\e2e\popup-delay-results.json`, JSON.stringify(results, null, 2))
const failed = results.filter((item) => !item.pass)
console.log(`\nสรุป: ${results.length - failed.length}/${results.length} ผ่าน`)
process.exit(failed.length ? 1 : 0)
