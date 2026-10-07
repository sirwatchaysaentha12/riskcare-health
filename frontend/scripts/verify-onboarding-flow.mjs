// ทดสอบ Flow การสมัครสมาชิกใหม่ RiskCARE-Health (7 กรณีตามสเปคที่ผู้ใช้สั่ง)
// รัน: DEMO_TEST_PASSWORD=... node scripts/verify-onboarding-flow.mjs  (dev server 5173)
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = 'http://localhost:5173'
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
const stamp = Date.now().toString().slice(-6)

const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['geolocation'],
  geolocation: { latitude: 13.7563, longitude: 100.5018 },
})
const page = await context.newPage()

async function signup(identifier, username) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'สมัครสมาชิก' }).last().click()
  await page.fill('#login-username', username)
  await page.fill('#login-identifier', identifier)
  await page.fill('input[type="password"]', PASSWORD)
  await page.getByRole('button', { name: 'สมัครสมาชิก' }).first().click()
}
async function login(identifier) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-identifier', identifier)
  await page.fill('input[type="password"]', PASSWORD)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
}
async function answerAll() {
  const cards = page.locator('.question-card')
  const count = await cards.count()
  for (let index = 0; index < count; index++) {
    await cards.nth(index).locator('label').nth(1).click()
  }
  await page.locator('.assessment-location-grid select').nth(0).selectOption({ index: 1 })
  await page.waitForTimeout(300)
  await page.locator('.assessment-location-grid select').nth(1).selectOption({ index: 1 })
}
async function clearSession() {
  // จำลอง "ปิดหน้า/หมด session" กลางทาง — ลบเฉพาะ session ของ Supabase
  // (draft แบบประเมินเก็บใน localStorage ต่างคีย์ ต้องอยู่ครบเหมือนผู้ใช้ปิดเบราว์เซอร์จริง)
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((key) => key.includes('sb-') && key.includes('auth'))
      .forEach((key) => localStorage.removeItem(key))
    sessionStorage.clear()
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
}

try {
  // ============ กรณีที่ 1: สมัครใหม่ → ต้องพาไปหน้าแบบสอบถาม ไม่เข้าหน้าหลัก ============
  const userA = `e2e-flow-a-${stamp}@test.local`
  await signup(userA, `flowa${stamp}`)
  await page.waitForURL('**/onboarding/assessment', { timeout: 20000 })
  await page.locator('.assessment-intro').waitFor({ timeout: 15000 }) // guard ตรวจสถานะก่อน render หน้าจริง
  const sidebarCount = await page.locator('.app-sidebar').count()
  const headingOk = await page.getByText(/คัดกรองความเสี่ยงระบบทางเดินหายใจ/).first().isVisible()
  record('กรณี 1: สมัครใหม่ → ถูกพาไปหน้าแบบสอบถาม', true, page.url())
  record('กรณี 1: หน้าแบบสอบถามไม่มีเมนู/Dashboard', sidebarCount === 0, `sidebar=${sidebarCount}`)
  record('กรณี 1: หัวข้อ "คัดกรองความเสี่ยงระบบทางเดินหายใจ ด้วยมาตรฐานสากล" แสดง', headingOk)
  const descOk = await page.getByText(/ประวัติสุขภาพ/).first().isVisible()
    && await page.getByText(/PM2\.5/).first().isVisible()
  record('กรณี 1: คำอธิบาย (ปัจจัยเสี่ยง/ประวัติสุขภาพ/PM2.5) แสดง', descOk)

  // ============ กรณีที่ 2: ตอบไม่ครบ → กดประเมินไม่ได้ + มีข้อความแจ้ง ============
  const submitBtn = page.getByRole('button', { name: /ประเมินความเสี่ยง/ })
  await submitBtn.waitFor({ timeout: 10000 })
  const disabledBefore = !(await submitBtn.isEnabled())
  await page.locator('.question-card').nth(0).locator('label').nth(1).click()
  await page.locator('.submit-wrapper').hover()
  await page.waitForTimeout(300)
  const hintVisible = await page.locator('.form-hint.is-visible').isVisible()
  record('กรณี 2: ตอบไม่ครบ → ปุ่มประเมิน disabled', disabledBefore)
  record('กรณี 2: แสดง validation message เข้าใจง่าย', hintVisible, (await page.locator('.form-hint').innerText()).slice(0, 80))

  // ============ กรณีที่ 3: ตอบครบ → popup ผลประเมิน + สถานะ/ระดับ ============
  await answerAll()
  await page.getByRole('button', { name: /ประเมินความเสี่ยง/ }).click()
  const overlaySeen = (await page.locator('.processing-overlay').count()) > 0
  const modal = page.locator('.result-modal')
  await modal.waitFor({ timeout: 30000 })
  const zoneChip = await modal.locator('.result-modal-zone-chip').innerText()
  const scoreVisible = /คะแนนรวมของคุณ/.test(await modal.innerText())
  record('กรณี 3: มี loading state ระหว่างประมวลผล', overlaySeen)
  record('กรณี 3: Popup "ผลการประเมินความเสี่ยง" แสดง + zone สี + คะแนน',
    /ผลการประเมิน/.test(await modal.innerText()) && scoreVisible, zoneChip.trim())

  // ============ กรณีที่ 4: กด "เข้าสู่หน้าหลัก" → ไปหน้าหลักที่มีเมนูซ้าย ============
  await page.getByRole('button', { name: 'กดเพื่อเข้าสู่หน้าหลัก' }).click() // ปุ่มหลักใน popup (หน้า result-card มีปุ่ม "เข้าสู่หน้าหลัก" ซ้อนอยู่ — ระบุชื่อเต็มกันชน)
  await page.waitForURL(`${BASE}/`, { timeout: 15000 })
  await page.locator('.app-sidebar').waitFor({ timeout: 15000 }) // guard ตรวจสถานะก่อน render หน้าหลัก
  record('กรณี 4: กดเข้าสู่หน้าหลัก → Dashboard มีเมนูซ้าย', true, page.url())

  // ============ กรณีที่ 5: Logout → Login ใหม่ → เข้าหน้าหลักเลย ไม่ถูกส่งไปแบบสอบถาม ============
  await page.locator('.sidebar-logout').click()
  await page.waitForURL('**/login', { timeout: 15000 })
  await login(userA)
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), { timeout: 20000 })
  record('กรณี 5: ผู้ใช้ที่ทำแล้ว login ใหม่ → เข้าหน้าหลักตรง',
    !page.url().includes('/onboarding'), page.url())

  // ============ กรณีที่ 7 (ผู้ใช้ที่ทำแล้ว): direct URL หน้า onboarding → เด้งกลับหน้าหลัก ============
  await page.goto(`${BASE}/onboarding/assessment`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !window.location.pathname.startsWith('/onboarding'), { timeout: 15000 })
  record('กรณี 7a: ผู้ใช้ที่ทำแล้วเข้า /onboarding/assessment ตรง → เด้งกลับหน้าหลัก (ไม่ทำซ้ำ)',
    !page.url().includes('/onboarding'), page.url())

  // ============ กรณีที่ 6: สมัครใหม่ → ตอบบางส่วน → ออกกลางทาง → login กลับ → กลับมาหน้าเดิม + คำตอบไม่หาย ============
  const userB = `e2e-flow-b-${stamp}@test.local`
  await signup(userB, `flowb${stamp}`)
  await page.waitForURL('**/onboarding/assessment', { timeout: 20000 })
  await page.locator('.assessment-form').waitFor({ timeout: 15000 })
  for (let index = 0; index < 3; index++) {
    await page.locator('.question-card').nth(index).locator('label').nth(1).click()
  }
  await page.waitForTimeout(500) // ให้ effect บันทึก draft ทำงาน
  const draftSaved = await page.evaluate(() => Boolean(localStorage.getItem('riskcare_assessment_draft_v1')))
  record('กรณี 6: draft ถูกบันทึกอัตโนมัติระหว่างทำ', draftSaved)
  await clearSession()
  await login(userB)
  await page.waitForURL('**/onboarding/assessment', { timeout: 20000 })
  record('กรณี 6: login กลับก่อนทำเสร็จ → ถูกพากลับหน้าแบบสอบถาม', true, page.url())
  await page.locator('.assessment-form').waitFor({ timeout: 15000 })
  const restored = await page.locator('.progress-label').innerText()
  const answeredRestored = /ตอบแล้ว 3\/14/.test(restored)
  record('กรณี 6: คำตอบเดิมไม่หาย (draft restore → ตอบแล้ว 3/14)', answeredRestored, restored)

  // ============ กรณีที่ 7 (ผู้ใช้ยังไม่ทำ): direct URL / refresh / back ต้องไม่ข้ามขั้น ============
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL('**/onboarding/assessment', { timeout: 15000 })
  record('กรณี 7b: ผู้ใช้ยังไม่ทำ พิมพ์ URL หน้าหลักตรง → เด้งไปหน้าแบบสอบถาม', true, page.url())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForURL('**/onboarding/assessment', { timeout: 15000 })
  record('กรณี 7c: refresh บนหน้าแบบสอบถาม → ยังอยู่หน้าเดิม ไม่หลุดขั้นตอน', true, page.url())
  await page.goto(`${BASE}/assessment`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL('**/onboarding/assessment', { timeout: 15000 })
  record('กรณี 7d: direct URL /assessment (เส้นทางเดิม) → ยังถูกบังคับที่ onboarding', true, page.url())
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  record('กรณี 7e: browser back → ไม่หลุดไปหน้าหลัก (ยังไม่ทำแบบประเมิน)',
    !/^http:\/\/localhost:5173\/$/.test(page.url()) || page.url().includes('/onboarding'), page.url())
  await page.waitForTimeout(2500) // เฝ้าดู redirect loop: URL ต้องนิ่ง
  const settledUrl = page.url()
  await page.waitForTimeout(1500)
  record('กรณี 7f: ไม่เกิด redirect loop (URL นิ่งหลังรอ)', page.url() === settledUrl, settledUrl)

  // เคลียร์ท้ายเทส: ปิดกล้อง/หน้า — ไม่ยุ่งข้อมูลบัญชี (บัญชี A ทำแบบประเมินจริง, บัญชี B ค้างร่าง)
} catch (error) {
  record('UNEXPECTED ERROR', false, String(error).slice(0, 400))
  await page.screenshot({ path: String.raw`C:\Users\ACER\projectweb\tmp-vitallens\e2e\onboarding-error.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

writeFileSync(String.raw`C:\Users\ACER\projectweb\tmp-vitallens\e2e\onboarding-flow-results.json`, JSON.stringify(results, null, 2))
const failed = results.filter((item) => !item.pass)
console.log(`\nสรุป: ${results.length - failed.length}/${results.length} ผ่าน${failed.length ? `, ล้มเหลว ${failed.length}` : ''}`)
process.exit(failed.length ? 1 : 0)
