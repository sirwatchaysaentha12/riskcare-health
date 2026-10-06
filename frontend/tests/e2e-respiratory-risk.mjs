// E2E ทดสอบหน้า RespiratoryRiskAssessment ด้วยกล้องเสมือนที่ให้สัญญาณ "คลิปคนจริง"
// (--use-file-for-fake-video-capture) ครบทั้ง 3 สัญญาณ: MediaPipe RR + vitallens (upload ผ่าน backend) + แบบประเมินจาก Supabase
// รัน: node tests/e2e-respiratory-risk.mjs  (ต้องเปิด dev server 5173 และ admin-app 3000)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:5173'
// Phase 15 — test credential ต้องมาจาก environment (DEMO_TEST_PASSWORD) — ห้ามมี default ใน source
const EMAIL = 'e2e-breath@test.local'
const PASSWORD = process.env.DEMO_TEST_PASSWORD
if (!PASSWORD) {
  console.error('SAFE ERROR: DEMO_TEST_PASSWORD is required for the e2e login (ตั้งค่าใน shell session เท่านั้น ห้ามเขียนลงไฟล์)')
  process.exit(1)
}
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
const mainContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['geolocation'],
  geolocation: { latitude: 13.7563, longitude: 100.5018 },
})
const page = await mainContext.newPage()
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

  // ---- 4. Phase 5 Consent Gate: ไม่ยินยอม = ปุ่มวัด disabled (โหมดกล้อง) + อัปโหลด locked (โหมดวิดีโอ) + audit event ----
  const consentLogs = []
  page.on('console', (message) => {
    if (message.text().includes('[rrisk-consent]')) consentLogs.push(message.text())
  })
  const measureBtn = page.getByRole('button', { name: 'เริ่มวัดการหายใจ (30 วินาที)' })
  // โหมดกล้อง (ยังไม่ยินยอม): ปุ่มวัดทั้งของ shell และของคอมโพเนนต์กล้องต้อง disabled
  await page.getByRole('button', { name: 'กล้องสด' }).click()
  await measureBtn.waitFor({ timeout: 5000 })
  record('Consent gate: ไม่ยินยอม → ปุ่มเริ่มวัด disabled (กล้องเปิดไม่ได้)', !(await measureBtn.isEnabled()))
  const shellCameraBtn = page.getByRole('button', { name: 'เริ่มวิเคราะห์อัตราการหายใจ' })
  record('Consent gate: ปุ่มเริ่มวิเคราะห์ของ shell ก็ disabled เช่นกัน', (await shellCameraBtn.count()) === 1 && !(await shellCameraBtn.isEnabled()))
  // กลับโหมดวิดีโอ: input file ต้อง locked
  await page.getByRole('button', { name: 'อัปโหลดคลิปวิดีโอ' }).click()
  const uploadInput = page.locator('input[type="file"]')
  record('Consent gate: ไม่ยินยอม → อัปโหลดวิดีโอ locked เช่นกัน', !(await uploadInput.isEnabled()))
  await page.getByText('ฉันรับทราบข้อมูลข้างต้นครบถ้วน').click()
  const researchUnchecked = await page.locator('.rrisk-consent-item input').nth(3).isChecked()
  record('Research consent ไม่ถูกเลือกไว้ล่วงหน้า', researchUnchecked === false)
  await page.getByText('ยินยอมให้เปิดกล้องเพื่อวัดสัญญาณตามที่ระบุ').click()
  await page.getByText('รับทราบข้อจำกัด: เป็นค่าประมาณจากกล้อง', { exact: false }).click()
  record('Consent: ติ๊กครบ → อัปโหลดปลดล็อก', await uploadInput.isEnabled())
  await page.waitForTimeout(300)
  record('Consent Audit Event (ไม่มีข้อมูลสุขภาพ — log เฉพาะสถานะยินยอม)', consentLogs.some((line) => line.includes('"granted"')), consentLogs.at(-1)?.slice(0, 140))

  // ---- 5. fallback: อัปโหลดวิดีโอไม่มีใบหน้า → vitallens ล้มเหลวแบบ soft failure (หลังยินยอม) ----
  // (UI shell merge: เลือกไฟล์แล้วต้องกด "เริ่มประเมินจากวิดีโอ" — logic vitallens ตัวเดิม)
  await page.locator('input[type="file"]').setInputFiles(NOFACE_CLIP)
  await page.getByRole('button', { name: 'เริ่มประเมินจากวิดีโอ' }).click()
  try {
    await page.getByText('vitallens ประมวลผลไม่สำเร็จ').first().waitFor({ timeout: 120000 })
  } catch {
    const bodyText = await page.locator('main').innerText().catch(() => '(no main)')
    throw new Error(`fallback ไม่แสดง — หน้า: ${bodyText.replace(/\n/g, ' | ').slice(0, 300)}`)
  }
  record('fallback: vitallens ล้มเหลว (ไม่มีใบหน้า) → แจ้งผู้ใช้ ไม่ crash', true)
  await page.screenshot({ path: path.join(OUT_DIR, '2-vitallens-fallback.png'), fullPage: true })

  // ---- 6. กล้องจริง (สัญญาณคลิปคนจริง): สลับโหมดกล้องสด → วัด RR 30 วินาที + บันทึกคลิปส่ง vitallens ----
  await page.getByRole('button', { name: 'กล้องสด' }).click()
  await measureBtn.waitFor({ timeout: 5000 })
  await measureBtn.click()
  try {
    await page.getByText('กำลังวัด', { exact: false }).waitFor({ timeout: 35000 })
  } catch {
    const cameraText = await page.locator('.rrisk-camera').innerText().catch(() => '(ไม่พบ .rrisk-camera)')
    throw new Error(`ไม่เข้าสถานะกำลังวัด — สถานะกล้อง: ${cameraText.replace(/\n/g, ' | ').slice(0, 300)}`)
  }
  record('เริ่มวัด RR จากกล้อง (คลิปคนจริง)', true)
  await page.waitForTimeout(16000)
  await page.screenshot({ path: path.join(OUT_DIR, '3-measuring.png'), fullPage: true })

  // ---- 6. ผล RR + Quality Gate + vitallens (วัด 30 วิ + อัปโหลด) ----
  await page.getByText(/วัดได้ RR|ไม่ถูกนำไปใช้|ประมาณค่า RR ไม่สำเร็จ/).first().waitFor({ timeout: 60000 })
  const rrOutcome = await page.locator('.rrisk-rr-outcome').innerText()
  record('วัด RR เสร็จ + มีข้อความผล', true, rrOutcome.replace(/\n/g, ' | ').slice(0, 150))

  // Phase 2 — Quality Gate: ต้องมี structured quality block เสมอ
  await page.locator('.rrisk-quality').waitFor({ timeout: 5000 })
  const qualityText = await page.locator('.rrisk-quality').innerText()
  const qualityOk = /Quality Gate:/.test(qualityText)
  const qualityInsufficient = /คุณภาพไม่พอ/.test(qualityText)
  record('Quality Gate แสดงผล (qualityStatus + 9 การตรวจ)', qualityOk, qualityText.replace(/\n/g, ' | ').slice(0, 200))
  if (qualityInsufficient) {
    const hasGuidance = /คำแนะนำการวัดใหม่/.test(qualityText)
    record('คุณภาพไม่พอ → มี missingReason + retryGuidance', hasGuidance)
  }
  await page.screenshot({ path: path.join(OUT_DIR, '5-quality-gate.png'), fullPage: true })

  // vitallens — ข้อความ fallback เก่าถูกล้างตอนเริ่มอัปโหลด (UI shell merge: สถานะอยู่คอลัมน์ขวา จึงค้นทั้งหน้า)
  await page.getByText(/vitallens \(ประมวลผลในเครื่อง\)|vitallens ประมวลผลไม่สำเร็จ|ไม่ได้รับคลิปวิดีโอ/).first().waitFor({ timeout: 180000 })
  const vitalsOutcome = await page.locator('.rrisk-signal-ok, .rrisk-signal-warn').allTextContents()
  const vitalsOk = vitalsOutcome.some((text) => /vitallens \(ประมวลผลในเครื่อง\)/.test(text))
  record('สัญญาณที่ 2 vitallens จากคลิปกล้อง', vitalsOk, vitalsOutcome.join(' | ').slice(0, 200))
  if (vitalsOk) {
    record('Algorithm Confidence แสดงแยกจากความแม่นยำคลินิก', /ไม่ใช่ความแม่นยำทางคลินิก/.test(vitalsOutcome.join(' ')))
    record('SpO2 แสดง "ไม่มีข้อมูล" (ไม่สร้างค่าจำลอง)', /SpO2: ไม่มีข้อมูล/.test(vitalsOutcome.join(' ')))
  }

  // ---- 7. ผลรวม: สัญญาณแยก + คะแนนรวม + ระดับ + บอกสัญญาณที่ขาด ----
  const totalText = await page.locator('.rrisk-total').innerText()
  record('ผลรวม: คะแนน + ระดับ', /คะแนนความเสี่ยง/.test(totalText), totalText.replace(/\n/g, ' ').slice(0, 120))
  const signalCards = await page.locator('.rrisk-signal').count()
  record('ผลแต่ละสัญญาณแยก 4 ใบ (RR/SpO2/HR/แบบประเมิน)', signalCards === 4, `cards=${signalCards}`)
  // item 21: ค่าที่ Quality Insufficient ต้องแสดงเป็น "ไม่มีข้อมูล" ไม่ใช่ค่าปกติ/ค่าที่วัดได้
  const rrCardText = await page.locator('.rrisk-signal').first().innerText()
  record('Quality Insufficient ไม่ถูกแสดงเป็นค่าปกติ (RR = ไม่มีข้อมูล)',
    qualityInsufficient && /ไม่มีข้อมูล/.test(rrCardText) && !/ครั้ง\/นาที.*ปกติ/.test(rrCardText.split('คุณภาพสัญญาณ')[0]),
    rrCardText.split('\n')[1] || '')
  const coverage = await page.locator('.rrisk-coverage').innerText()
  record('แจ้งชัดว่าใช้/ขาดสัญญาณไหน', /สัญญาณที่ใช้/.test(coverage), coverage.replace(/\n/g, ' | ').slice(0, 220))
  record('ระบุสถานะ clinical accuracy ชัด (ยังไม่ผ่านการตรวจสอบ)', /ยังไม่ได้รับการตรวจสอบ/.test(coverage))

  // ---- Phase 3: การ์ด 4 ชั้น + Good/Borderline/Insufficient + Clinician Summary ----
  const cardText = await page.locator('.rrisk-signal').first().innerText()
  record('การ์ดสัญญาณมี 4 ชั้น (ค่า/คุณภาพ/ที่มา/สถานะคลินิก)',
    /คุณภาพสัญญาณ/.test(cardText) && /ที่มาของค่า/.test(cardText) && /สถานะความถูกต้องทางคลินิก/.test(cardText))
  const allCards = (await page.locator('.rrisk-signal').allTextContents()).join(' ')
  const qualityWord = /Good|Borderline|Insufficient/.test(allCards)
  record('แสดงข้อความ Good/Borderline/Insufficient (สีไม่ใช่ตัวบ่งชี้เดียว)', qualityWord)
  record('Algorithm Confidence แยกจาก Clinical Accuracy ในการ์ด HR (ทุกใบมี not-validated)',
    (allCards.match(/ยังไม่ได้รับการตรวจสอบ/g) || []).length >= 4)

  const clinician = page.locator('#clinician-summary')
  await clinician.waitFor({ timeout: 5000 })
  const clinicianText = await clinician.innerText()
  record('Clinician Review Summary: วันเวลา + รหัสไม่แสดงตัวตน (Pseudonymous)',
    /วันเวลารายงาน/.test(clinicianText) && /รหัสอ้างอิงผู้ใช้/.test(clinicianText))
  const anonOk = /รหัสอ้างอิงผู้ใช้ \(Pseudonymous ID — รหัสเทียม\): ([0-9A-F]{8}|UNKNOWN)/.exec(clinicianText)
  record('รหัสผู้ใช้แบบ Pseudonymous (hash 8 ตัวอักษร หรือ UNKNOWN)', Boolean(anonOk), anonOk?.[1])
  record('Summary ประกาศไม่รวม Raw Video/ข้อมูลระบุตัวตน', /ไม่รวมวิดีโอดิบ/.test(clinicianText))
  record('Summary มีข้อความไม่ใช่การวินิจฉัย + not-validated', /ไม่ใช่การวินิจฉัยโรค/.test(clinicianText) && /ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก/.test(clinicianText))
  const printButton = page.getByRole('button', { name: 'พิมพ์รายงาน' })
  record('ปุ่มพิมพ์รายงาน (Print/Report)', (await printButton.count()) === 1 && (await printButton.isEnabled()))
  record('ข้อห้ามคำ: ไม่มี "medical-grade"/"clinically accurate"/"ปกติแน่นอน" บนหน้า',
    !/medical-grade|clinically accurate|ปกติแน่นอน|ปลอดภัยแน่นอน/.test((await page.locator('main').innerText())))

  // Keyboard: Tab ต้องโฟกัส interactive element ได้
  await page.keyboard.press('Tab')
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName)
  record('Keyboard: Tab โฟกัส interactive element ได้', ['BUTTON', 'A', 'INPUT', 'SUMMARY'].includes(focusedTag), focusedTag)
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

  // ---- Phase 5: Browser Lifecycle (context แยก ใช้ session เดิม + patch getUserMedia จับ stream) ----
  const storageState = await mainContext.storageState()
  async function newLifecycleContext(getUserMediaPatch, { switchToCamera = true } = {}) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ['geolocation'],
      geolocation: { latitude: 13.7563, longitude: 100.5018 },
      storageState,
    })
    if (getUserMediaPatch) await context.addInitScript(getUserMediaPatch)
    const lifecyclePage = await context.newPage()
    await lifecyclePage.goto(`${BASE}/respiratory-risk`, { waitUntil: 'domcontentloaded' })
    await lifecyclePage.getByRole('heading', { name: 'ประเมินความเสี่ยงโรคทางเดินหายใจ' }).waitFor({ timeout: 15000 })
    // UI shell merge: ปุ่มวัดกล้องอยู่ในโหมด "กล้องสด" — สลับก่อนติ๊ก consent
    if (switchToCamera) await lifecyclePage.getByRole('button', { name: 'กล้องสด' }).click()
    // ติ๊ก consent ให้พร้อมวัด
    await lifecyclePage.getByText('ฉันรับทราบข้อมูลข้างต้นครบถ้วน').click()
    await lifecyclePage.getByText('ยินยอมให้เปิดกล้องเพื่อวัดสัญญาณตามที่ระบุ').click()
    await lifecyclePage.getByText('รับทราบข้อจำกัด: เป็นค่าประมาณจากกล้อง', { exact: false }).click()
    return { context, lifecyclePage }
  }

  const trackPatch = `
    window.__streams = []
    const __origGetUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await __origGetUM(constraints)
      window.__streams.push(stream)
      return stream
    }
  `

  // (a) กดหยุด / retry ไม่ซ้อน / ออกจากหน้า → track หยุดครบ
  {
    const { context, lifecyclePage } = await newLifecycleContext(trackPatch)
    const btn = lifecyclePage.getByRole('button', { name: 'เริ่มวัดการหายใจ (30 วินาที)' })
    await btn.click()
    await lifecyclePage.getByText('กำลังวัด', { exact: false }).waitFor({ timeout: 35000 })
    await lifecyclePage.getByRole('button', { name: 'ยกเลิกการวัด (ปิดกล้อง)' }).click()
    await lifecyclePage.getByText('ยกเลิกการวัดแล้ว', { exact: false }).waitFor({ timeout: 5000 })
    const afterCancel = await lifecyclePage.evaluate(() =>
      window.__streams.map((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))
    record('กดหยุด (ยกเลิก) → track กล้อง+เสียงหยุดครบ', afterCancel.length === 1 && afterCancel[0] === true)

    await btn.click() // retry
    try {
      await lifecyclePage.getByText('กำลังวัด', { exact: false }).waitFor({ timeout: 35000 })
    } catch {
      const cameraText = await lifecyclePage.locator('.rrisk-camera').innerText().catch(() => '(no camera)')
      throw new Error(`retry ไม่เข้าสถานะกำลังวัด — กล้อง: ${cameraText.replace(/\n/g, ' | ').slice(0, 300)}`)
    }
    const afterRetry = await lifecyclePage.evaluate(() => ({
      count: window.__streams.length,
      previousEnded: window.__streams.slice(0, -1).every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')),
      currentLive: window.__streams.at(-1)?.getTracks().some((track) => track.readyState === 'live'),
    }))
    record('Retry ไม่สร้าง stream ซ้อน (ครั้งก่อน ended, ครั้งใหม่ live เดียว)',
      afterRetry.count === 2 && afterRetry.previousEnded && afterRetry.currentLive === true)
    await lifecyclePage.getByRole('button', { name: 'ยกเลิกการวัด (ปิดกล้อง)' }).click()
    await lifecyclePage.getByText('ยกเลิกการวัดแล้ว', { exact: false }).waitFor({ timeout: 5000 })
    await lifecyclePage.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })
    await lifecyclePage.waitForTimeout(1500)
    const afterLeave = await lifecyclePage.evaluate(() =>
      window.__streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))
    record('ออกจากหน้า → ทุก track หยุดครบ', afterLeave === true)
    await context.close()
  }

  // (b) Deny permission → แจ้งผู้ใช้ + fallback ไม่ crash
  {
    const denyPatch = `
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }
    `
    const { context, lifecyclePage } = await newLifecycleContext(denyPatch)
    await lifecyclePage.getByRole('button', { name: 'เริ่มวัดการหายใจ (30 วินาที)' }).click()
    await lifecyclePage.getByText('เปิดกล้องไม่ได้', { exact: false }).waitFor({ timeout: 10000 })
    record('Deny permission → แจ้งเหตุผล + ยังประเมินจากแบบประเมินได้ (ไม่ crash)', true)
    await context.close()
  }

  // (c) Backend error → soft failure message, ไม่ crash (โหมดวิดีโอ: เลือกไฟล์แล้วกดเริ่มประเมิน)
  {
    const { context, lifecyclePage } = await newLifecycleContext(null, { switchToCamera: false })
    await lifecyclePage.route('**/api/vital-signs', (route) => route.abort('failed'))
    await lifecyclePage.locator('input[type="file"]').setInputFiles(NOFACE_CLIP)
    await lifecyclePage.getByRole('button', { name: 'เริ่มประเมินจากวิดีโอ' }).click()
    await lifecyclePage.getByText('vitallens ประมวลผลไม่สำเร็จ', { exact: false }).first().waitFor({ timeout: 30000 })
    record('Backend error (network abort) → soft failure + ไม่ crash', true)
    await context.close()
  }

  // ---- Phase 3: Mobile viewport ไม่มี overflow แนวนอน (ใช้ session เดิม) ----
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['geolocation'],
    geolocation: { latitude: 13.7563, longitude: 100.5018 },
    storageState: await mainContext.storageState(),
  })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(`${BASE}/respiratory-risk`, { waitUntil: 'domcontentloaded' })
  await mobilePage.getByRole('heading', { name: 'ประเมินความเสี่ยงโรคทางเดินหายใจ' }).waitFor({ timeout: 15000 })
  await mobilePage.waitForTimeout(2500)
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  record('Mobile 390px: ไม่มี overflow แนวนอน', overflow <= 2, `overflow=${overflow}px`)
  await mobilePage.screenshot({ path: path.join(OUT_DIR, '6-mobile.png'), fullPage: true })
  await mobileContext.close()
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
