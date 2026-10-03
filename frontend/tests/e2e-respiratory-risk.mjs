// E2E ทดสอบหน้า RespiratoryRiskAssessment ด้วยกล้องเสมือนที่ให้สัญญาณ "คลิปคนจริง"
// (--use-file-for-fake-video-capture) ครบทั้ง 3 สัญญาณ: MediaPipe RR + vitallens (upload ผ่าน backend) + แบบประเมินจาก Supabase
// รัน: node tests/e2e-respiratory-risk.mjs  (ต้องเปิด dev server 5173 และ admin-app 3000)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:5173'
const EMAIL = 'e2e-breath@test.local'
const PASSWORD = 'TestPass123!'
const FACE_CLIP = process.argv[2] || String.raw`C:\Users\ACER\projectweb\tmp-vitallens\clip25.y4m`
const NOFACE_CLIP = process.argv[3] || String.raw`C:\Users\ACER\projectweb\tmp-vitallens\noface.mp4`
const OUT_DIR = String.raw`C:\Users\ACER\projectweb\tmp-vitallens\e2e`

mkdirSync(OUT_DIR, { recursive: true })

const results = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? `: ${detail}` : ''}`)
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium', // full chromium (new headless) — headless shell ไม่รองรับ fake video capture
  args: [
    '--use-fake-ui-for-media-stream',           // อนุญาตกล้องอัตโนมัติ
    '--use-fake-device-for-media-stream',       // ใช้กล้องเสมือน
    `--use-file-for-fake-video-capture=${FACE_CLIP.replace(/\\/g, '/')}`, // สัญญาณวิดีโอ = คลิปคนจริง (chromium fake camera อ่านเฉพาะ y4m/mjpeg)
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
  ],
})
const page = await (await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['geolocation'],
  geolocation: { latitude: 13.7563, longitude: 100.5018 },
})).newPage()
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[console.error]', message.text().slice(0, 300))
})

try {
  // ---- 1. ล็อกอิน ----
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#login-identifier', EMAIL)
  await page.fill('input[autocomplete="current-password"], input[type="password"]', PASSWORD)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), { timeout: 15000 })
  record('ล็อกอินด้วยบัญชีทดสอบ', true, page.url())

  // ---- 2. เข้าหน้าประเมิน ----
  await page.goto(`${BASE}/respiratory-risk`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'ประเมินความเสี่ยงโรคทางเดินหายใจ' }).waitFor({ timeout: 10000 })
  const disclaimerCount = await page.getByText('ไม่ใช่การวินิจฉัยทางการแพทย์').count()
  record('หน้าประเมินแสดงผล + disclaimer', disclaimerCount >= 1, `disclaimer x${disclaimerCount}`)
  await page.screenshot({ path: path.join(OUT_DIR, '1-page-initial.png'), fullPage: true })

  // ---- 3. สัญญาณที่ 3: แบบประเมินจาก Supabase โหลดได้ (หรือแจ้งว่าไม่มีแบบไม่พัง) ----
  await page.waitForTimeout(2500)
  const questionnaireOk = await page.locator('.rrisk-signal-ok, .rrisk-signal-warn').count()
  record('สัญญาณแบบประเมินโหลด/แจ้งสถานะ', questionnaireOk >= 1)

  // ---- 4. fallback: อัปโหลดวิดีโอไม่มีใบหน้า → vitallens ล้มเหลวแบบ soft failure ----
  await page.locator('input[type="file"]').setInputFiles(NOFACE_CLIP)
  await page.getByText('vitallens ประมวลผลไม่สำเร็จ', { exact: false }).waitFor({ timeout: 120000 })
  record('fallback: vitallens ล้มเหลว (ไม่มีใบหน้า) → แจ้งผู้ใช้ ไม่ crash', true)
  await page.screenshot({ path: path.join(OUT_DIR, '2-vitallens-fallback.png'), fullPage: true })

  // ---- 5. กล้องจริง (สัญญาณคลิปคนจริง): วัด RR 30 วินาที + บันทึกคลิปส่ง vitallens ----
  await page.getByRole('button', { name: 'เริ่มวัดการหายใจ (30 วินาที)' }).click()
  try {
    await page.getByText('กำลังวัด', { exact: false }).waitFor({ timeout: 35000 })
  } catch {
    const cameraText = await page.locator('.rrisk-camera').innerText().catch(() => '(ไม่พบ .rrisk-camera)')
    throw new Error(`ไม่เข้าสถานะกำลังวัด — สถานะกล้อง: ${cameraText.replace(/\n/g, ' | ').slice(0, 300)}`)
  }
  record('เริ่มวัด RR จากกล้อง (คลิปคนจริง)', true)
  await page.waitForTimeout(16000)
  await page.screenshot({ path: path.join(OUT_DIR, '3-measuring.png'), fullPage: true })

  // ---- 6. ผล RR + vitallens + ผลรวม (วัด 30 วิ + อัปโหลด) — ข้อความ fallback เก่าถูกล้างตอนเริ่มอัปโหลด ----
  await page.getByText(/วัดได้ RR|การวัดไม่น่าเชื่อถือ/).first().waitFor({ timeout: 60000 })
  const rrDone = await page.getByText(/วัดได้ RR|การวัดไม่น่าเชื่อถือ/).first().textContent()
  record('วัด RR เสร็จ (มีผลหรือแจ้งว่าไม่น่าเชื่อถือ)', Boolean(rrDone), rrDone?.slice(0, 120))

  await page.getByText(/vitallens: HR|vitallens ประมวลผลไม่สำเร็จ|ไม่ได้รับคลิปวิดีโอ/).first().waitFor({ timeout: 180000 })
  const vitalsOutcome = await page.locator('.rrisk-section').nth(1).locator('.rrisk-signal-ok, .rrisk-signal-warn').allTextContents()
  const vitalsOk = vitalsOutcome.some((text) => /vitallens: HR/.test(text))
  record('สัญญาณที่ 2 vitallens จากคลิปกล้อง', vitalsOk, vitalsOutcome.join(' | ').slice(0, 160))

  // ---- 7. ผลรวม: สัญญาณแยก + คะแนนรวม + ระดับ + บอกสัญญาณที่ขาด ----
  const totalText = await page.locator('.rrisk-total').innerText()
  record('ผลรวม: คะแนน + ระดับ', /คะแนนความเสี่ยง/.test(totalText), totalText.replace(/\n/g, ' ').slice(0, 120))
  const signalCards = await page.locator('.rrisk-signal').count()
  record('ผลแต่ละสัญญาณแยก 4 ใบ (RR/SpO2/HR/แบบประเมิน)', signalCards === 4, `cards=${signalCards}`)
  const coverage = await page.locator('.rrisk-coverage').innerText()
  record('แจ้งชัดว่าใช้/ขาดสัญญาณไหน', /สัญญาณที่ใช้/.test(coverage), coverage.replace(/\n/g, ' | ').slice(0, 200))
  await page.screenshot({ path: path.join(OUT_DIR, '4-final-result.png'), fullPage: true })

  // ---- 8. การ์ดจากหน้าภาพรวม ----
  await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })
  const entryLink = page.getByRole('link', { name: 'เริ่มประเมินความเสี่ยงโรคทางเดินหายใจ →' })
  try {
    await entryLink.waitFor({ timeout: 40000 })
  } catch {
    const overviewText = await page.locator('main').innerText().catch(() => '(ไม่พบ main)')
    throw new Error(`ไม่พบการ์ดในหน้าภาพรวม — เนื้อหา: ${overviewText.replace(/\n/g, ' | ').slice(0, 300)}`)
  }
  record('การ์ดเข้าถึงจากหน้าภาพรวม', await entryLink.isVisible())
  await entryLink.click()
  await page.waitForURL(`${BASE}/respiratory-risk`, { timeout: 10000 })
  record('ลิงก์เข้าสู่หน้าประเมินได้จริง', true)
} catch (error) {
  record('UNEXPECTED ERROR', false, String(error).slice(0, 500))
  await page.screenshot({ path: path.join(OUT_DIR, 'error.png'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((item) => !item.pass)
console.log(`\nสรุป: ${results.length - failed.length}/${results.length} ผ่าน${failed.length ? `, ล้มเหลว ${failed.length}` : ''}`)
process.exit(failed.length ? 1 : 0)
