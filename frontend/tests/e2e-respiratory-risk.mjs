// E2E Phase 23 — หน้าแยกโหมด: /respiratory-risk = อัปโหลดวิดีโอเท่านั้น (vitallens HR)
//                   /breathing-check = กล้องสดเท่านั้น (MediaPipe RR)
// กล้องเสมือน: --use-file-for-fake-video-capture ให้สัญญาณ "คลิปคนจริง"
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
const NOFACE_CLIP = process.argv[2] || String.raw`C:\Users\ACER\projectweb\tmp-vitallens\noface.mp4`
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
    `--use-file-for-fake-video-capture=${String.raw`C:\Users\ACER\projectweb\tmp-vitallens\clip25.y4m`.replace(/\\/g, '/')}`, // สัญญาณวิดีโอ = คลิปคนจริง
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

  // =====================================================================
  // ส่วน A — /respiratory-risk: โหมดเดียว (อัปโหลดคลิปวิดีโอ) — ไม่มีกล้อง/toggle
  // =====================================================================
  await page.goto(`${BASE}/respiratory-risk`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /ประเมินความเสี่ยงโรคทางเดินหายใจ/ }).waitFor({ timeout: 10000 })
  const disclaimerCount = await page.getByText('ไม่ใช่การวินิจฉัยทางการแพทย์').count()
  record('A1 หน้าประเมินแสดงผล + disclaimer', disclaimerCount >= 1, `disclaimer x${disclaimerCount}`)
  record('A2 Phase 23 split: ไม่มี toggle โหมดบนหน้าอัปโหลด', (await page.locator('.resp-mode-toggle').count()) === 0)
  record('A3 Phase 23 split: ไม่มีปุ่มขอกล้อง/คอมโพเนนต์กล้อง', (await page.getByRole('button', { name: 'อนุญาตเข้าถึงกล้อง' }).count()) === 0)
  await page.screenshot({ path: path.join(OUT_DIR, '1-upload-initial.png'), fullPage: true })

  // ---- สัญญาณที่ 3: แบบประเมินจาก Supabase โหลดได้ (หรือแจ้งว่าไม่มีแบบไม่พัง) ----
  await page.waitForTimeout(2500)
  const questionnaireOk = await page.locator('.rrisk-signal-ok, .rrisk-signal-warn').count()
  record('A4 สัญญาณแบบประเมินโหลด/แจ้งสถานะ', questionnaireOk >= 1)

  // ---- Phase 5 Consent Gate: ไม่ยินยอม = อัปโหลด locked + audit event ----
  const consentLogs = []
  page.on('console', (message) => {
    if (message.text().includes('[rrisk-consent]')) consentLogs.push(message.text())
  })
  const uploadInput = page.locator('input[type="file"]')
  record('A5 Consent gate: ไม่ยินยอม → อัปโหลดวิดีโอ locked', !(await uploadInput.isEnabled()))
  await page.getByText('ฉันรับทราบข้อมูลข้างต้นครบถ้วน').click()
  const researchUnchecked = await page.locator('.rrisk-consent-item input').nth(3).isChecked()
  record('A6 Research consent ไม่ถูกเลือกไว้ล่วงหน้า', researchUnchecked === false)
  await page.getByText('ยินยอมให้เปิดกล้องเพื่อวัดสัญญาณตามที่ระบุ').click()
  await page.getByText('รับทราบข้อจำกัด: เป็นค่าประมาณจากกล้อง', { exact: false }).click()
  record('A7 Consent: ติ๊กครบ → อัปโหลดปลดล็อก', await uploadInput.isEnabled())
  await page.waitForTimeout(300)
  record('A8 Consent Audit Event (ไม่มีข้อมูลสุขภาพ — log เฉพาะสถานะยินยอม)', consentLogs.some((line) => line.includes('"granted"')), consentLogs.at(-1)?.slice(0, 140))

  // ---- fallback: อัปโหลดวิดีโอไม่มีใบหน้า → vitallens ล้มเหลวแบบ soft failure ----
  await uploadInput.setInputFiles(NOFACE_CLIP)
  await page.getByRole('button', { name: 'เริ่มประเมินจากวิดีโอ' }).click()
  try {
    await page.getByText('vitallens ประมวลผลไม่สำเร็จ').first().waitFor({ timeout: 120000 })
  } catch {
    const bodyText = await page.locator('main').innerText().catch(() => '(no main)')
    throw new Error(`A9 fallback ไม่แสดง — หน้า: ${bodyText.replace(/\n/g, ' | ').slice(0, 300)}`)
  }
  record('A9 fallback: vitallens ล้มเหลว (ไม่มีใบหน้า) → แจ้งผู้ใช้ ไม่ crash', true)
  await page.screenshot({ path: path.join(OUT_DIR, '2-upload-fallback.png'), fullPage: true })

  // ---- ผลรวม: 4 การ์ดสัญญาณ + RR ชี้ไป /breathing-check + Clinician Summary ----
  const totalText = await page.locator('.rrisk-total').innerText()
  record('A10 ผลรวม: คะแนน + ระดับ', /คะแนนความเสี่ยง/.test(totalText), totalText.replace(/\n/g, ' ').slice(0, 120))
  const signalCards = await page.locator('.rrisk-signal').count()
  record('A11 ผลแต่ละสัญญาณแยก 4 ใบ (RR/HR/SpO2/แบบประเมิน)', signalCards === 4, `cards=${signalCards}`)
  const rrCardText = await page.locator('.rrisk-signal').first().innerText()
  record('A12 RR = ไม่มีข้อมูล + ชี้ไปหน้า /breathing-check', /ไม่มีข้อมูล/.test(rrCardText) && /breathing-check/.test(rrCardText), (rrCardText.split('\n')[1] || '').slice(0, 120))
  const coverage = await page.locator('.rrisk-coverage').innerText()
  record('A13 แจ้งชัดว่าใช้/ขาดสัญญาณไหน', /สัญญาณที่ใช้/.test(coverage), coverage.replace(/\n/g, ' | ').slice(0, 220))
  record('A14 ระบุสถานะ clinical accuracy ชัด (ยังไม่ผ่านการตรวจสอบ)', /ยังไม่ได้รับการตรวจสอบ/.test(coverage))

  const clinician = page.locator('#clinician-summary')
  await clinician.waitFor({ timeout: 5000 })
  const clinicianText = await clinician.innerText()
  record('A15 Clinician Review Summary: วันเวลา + รหัส Pseudonymous',
    /วันเวลารายงาน/.test(clinicianText) && /รหัสอ้างอิงผู้ใช้/.test(clinicianText))
  const anonOk = /รหัสอ้างอิงผู้ใช้ \(Pseudonymous ID — รหัสเทียม\): ([0-9A-F]{8}|UNKNOWN)/.exec(clinicianText)
  record('A16 รหัสผู้ใช้แบบ Pseudonymous (hash 8 ตัวอักษร หรือ UNKNOWN)', Boolean(anonOk), anonOk?.[1])
  record('A17 Summary ประกาศไม่รวม Raw Video/ข้อมูลระบุตัวตน + not-validated',
    /ไม่รวมวิดีโอดิบ/.test(clinicianText) && /ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก/.test(clinicianText))
  const printButton = page.getByRole('button', { name: 'พิมพ์รายงาน' })
  record('A18 ปุ่มพิมพ์รายงาน', (await printButton.count()) === 1 && (await printButton.isEnabled()))
  record('A19 ข้อห้ามคำ: ไม่มี "medical-grade"/"clinically accurate"',
    !/medical-grade|clinically accurate|ปกติแน่นอน|ปลอดภัยแน่นอน/.test((await page.locator('main').innerText())))

  await page.keyboard.press('Tab')
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName)
  record('A20 Keyboard: Tab โฟกัส interactive element ได้', ['BUTTON', 'A', 'INPUT', 'SUMMARY'].includes(focusedTag), focusedTag)
  await page.screenshot({ path: path.join(OUT_DIR, '3-upload-result.png'), fullPage: true })

  // ---- Backend error → soft failure, ไม่ crash (context แยก เลือกไฟล์แล้วกดเริ่มประเมิน) ----
  {
    const storageState = await mainContext.storageState()
    const errorContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ['geolocation'],
      geolocation: { latitude: 13.7563, longitude: 100.5018 },
      storageState,
    })
    const errorPage = await errorContext.newPage()
    await errorPage.goto(`${BASE}/respiratory-risk`, { waitUntil: 'domcontentloaded' })
    await errorPage.getByRole('heading', { name: /ประเมินความเสี่ยงโรคทางเดินหายใจ/ }).waitFor({ timeout: 15000 })
    await errorPage.getByText('ฉันรับทราบข้อมูลข้างต้นครบถ้วน').click()
    await errorPage.getByText('ยินยอมให้เปิดกล้องเพื่อวัดสัญญาณตามที่ระบุ').click()
    await errorPage.getByText('รับทราบข้อจำกัด: เป็นค่าประมาณจากกล้อง', { exact: false }).click()
    await errorPage.route('**/api/vital-signs', (route) => route.abort('failed'))
    await errorPage.locator('input[type="file"]').setInputFiles(NOFACE_CLIP)
    await errorPage.getByRole('button', { name: 'เริ่มประเมินจากวิดีโอ' }).click()
    await errorPage.getByText('vitallens ประมวลผลไม่สำเร็จ', { exact: false }).first().waitFor({ timeout: 30000 })
    record('A21 Backend error (network abort) → soft failure + ไม่ crash', true)
    await errorContext.close()
  }

  // ---- Mobile viewport ไม่มี overflow แนวนอน ----
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['geolocation'],
    geolocation: { latitude: 13.7563, longitude: 100.5018 },
    storageState: await mainContext.storageState(),
  })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(`${BASE}/respiratory-risk`, { waitUntil: 'domcontentloaded' })
  await mobilePage.getByRole('heading', { name: /ประเมินความเสี่ยงโรคทางเดินหายใจ/ }).waitFor({ timeout: 15000 })
  await mobilePage.waitForTimeout(2500)
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  record('A22 Mobile 390px: ไม่มี overflow แนวนอน', overflow <= 2, `overflow=${overflow}px`)
  await mobilePage.screenshot({ path: path.join(OUT_DIR, '4-upload-mobile.png'), fullPage: true })
  await mobileContext.close()

  // =====================================================================
  // ส่วน B — /breathing-check: โหมดเดียว (กล้องสด MediaPipe RR) — ไม่มีอัปโหลด/toggle
  // =====================================================================
  const storageState = await mainContext.storageState()
  async function newBreathContext(getUserMediaPatch) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ['geolocation'],
      geolocation: { latitude: 13.7563, longitude: 100.5018 },
      storageState,
    })
    if (getUserMediaPatch) await context.addInitScript(getUserMediaPatch)
    const breathPage = await context.newPage()
    await breathPage.goto(`${BASE}/breathing-check`, { waitUntil: 'domcontentloaded' })
    await breathPage.getByRole('heading', { name: /ตรวจอัตราการหายใจด้วยกล้อง/ }).waitFor({ timeout: 15000 })
    return { context, breathPage }
  }

  {
    const { context, breathPage } = await newBreathContext()
    record('B1 หน้าตรวจหายใจแสดงผล (กล้องสดเท่านั้น)', true)
    record('B2 Phase 23 split: ไม่มี toggle โหมด', (await breathPage.locator('.resp-mode-toggle').count()) === 0)
    record('B3 Phase 23 split: ไม่มี input ไฟล์อัปโหลด', (await breathPage.locator('input[type="file"]').count()) === 0)
    const startCam = breathPage.getByRole('button', { name: 'ยินยอมและเปิดกล้อง' })
    await startCam.waitFor({ timeout: 5000 })
    record('B4 Consent gate: ไม่ยินยอม → ปุ่มเปิดกล้อง disabled', !(await startCam.isEnabled()))
    await breathPage.getByText('ฉันรับทราบการใช้กล้องและรายละเอียดข้างต้น', { exact: false }).click()
    record('B5 Consent: ติ๊กแล้ว → ปุ่มเปิดกล้องพร้อม', await startCam.isEnabled())
    await context.close()
  }

  // (a) วัดจริง 30 วินาที + lifecycle: หยุด/retry/ออกจากหน้า → track หยุดครบ
  {
    const trackPatch = `
      window.__streams = []
      const __origGetUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await __origGetUM(constraints)
        window.__streams.push(stream)
        return stream
      }
    `
    const { context, breathPage } = await newBreathContext(trackPatch)
    const startCam = breathPage.getByRole('button', { name: 'ยินยอมและเปิดกล้อง' })
    await breathPage.getByText('ฉันรับทราบการใช้กล้องและรายละเอียดข้างต้น', { exact: false }).click()
    await startCam.click()
    const startMeasure = breathPage.getByRole('button', { name: 'เริ่มวัด 30 วินาที' })
    await startMeasure.waitFor({ timeout: 30000 })
    await startMeasure.click({ timeout: 60000 }) // ปุ่ม disabled จนกว่าภาพพร้อม — click รอจน enable
    try {
      await breathPage.getByText('กำลังวัด', { exact: false }).waitFor({ timeout: 20000 })
    } catch {
      const bodyText = await breathPage.locator('main').innerText().catch(() => '(no main)')
      throw new Error(`B6 ไม่เข้าสถานะกำลังวัด — หน้า: ${bodyText.replace(/\n/g, ' | ').slice(0, 300)}`)
    }
    record('B6 เริ่มวัด RR จากกล้องสด (คลิปคนจริง)', true)

    // ผลลัพธ์รับ 2 แบบตามการออกแบบ: (1) วัดครบ 30 วิ → .br-result หรือ
    // (2) quality gate ตัดการวัดกลางทาง → กลับสู่ ready + คำแนะนำจัดภาพ
    // (คลิป y4m สังเคราะห์เคลื่อนไหวแรง → กรณี (2) คือพฤติกรรมที่ถูกต้องของระบบ ไม่ใช่ crash)
    await breathPage.waitForFunction(() => {
      const text = document.querySelector('main')?.innerText || ''
      return /ครั้ง\/นาที|วัดไม่ได้|ไม่สามารถประมาณค่าได้/.test(text) ||
        /หยุดการวัดเพราะภาพ|ภาพยังไม่พร้อมสำหรับการวัด/.test(text)
    }, { timeout: 90000 })
    const outcomeText = await breathPage.locator('main').innerText()
    const measuredDone = /ครั้ง\/นาที|วัดไม่ได้|ไม่สามารถประมาณค่าได้/.test(outcomeText)
    const qualityInterrupted = /หยุดการวัดเพราะภาพ|ภาพยังไม่พร้อมสำหรับการวัด/.test(outcomeText)
    record('B7 วัดจบสถานะ: ได้ผล หรือ quality gate ตัดพร้อมคำแนะนำ (ไม่ค้าง/ไม่ crash)',
      measuredDone || qualityInterrupted,
      measuredDone ? 'วัดครบ → มีผลออก' : 'quality gate ตัดการวัด (สัญญาณสังเคราะห์ไม่นิ่งพอ) + แสดงคำแนะนำ')
    await breathPage.screenshot({ path: path.join(OUT_DIR, '6-camera-result.png'), fullPage: true })

    // lifecycle: หยุด + ถอนความยินยอม → track ended ครบ
    await breathPage.getByRole('button', { name: 'หยุดกล้องและถอนความยินยอม' }).click()
    await breathPage.getByRole('button', { name: 'ยินยอมและเปิดกล้อง' }).waitFor({ timeout: 10000 })
    const afterStop = await breathPage.evaluate(() =>
      window.__streams.map((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))
    record('B8 หยุดกล้อง → track หยุดครบ + กลับสู่หน้าเริ่ม', afterStop.length === 1 && afterStop[0] === true)

    // retry: ติ๊ก consent ใหม่ → เปิดกล้องใหม่ → stream ไม่ซ้อน
    await breathPage.getByText('ฉันรับทราบการใช้กล้องและรายละเอียดข้างต้น', { exact: false }).click()
    await startCam.click()
    await breathPage.getByRole('button', { name: 'เริ่มวัด 30 วินาที' }).waitFor({ timeout: 30000 })
    const afterRetry = await breathPage.evaluate(() => ({
      count: window.__streams.length,
      previousEnded: window.__streams.slice(0, -1).every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')),
      currentLive: window.__streams.at(-1)?.getTracks().some((track) => track.readyState === 'live'),
    }))
    record('B9 Retry ไม่สร้าง stream ซ้อน (ครั้งก่อน ended, ครั้งใหม่ live เดียว)',
      afterRetry.count === 2 && afterRetry.previousEnded && afterRetry.currentLive === true)
    await breathPage.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })
    await breathPage.waitForTimeout(1500)
    const afterLeave = await breathPage.evaluate(() =>
      window.__streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended')))
    record('B10 ออกจากหน้า → ทุก track หยุดครบ', afterLeave === true)
    await context.close()
  }

  // (b) Deny permission → แจ้งผู้ใช้ + ไม่ crash
  {
    const denyPatch = `
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }
    `
    const { context, breathPage } = await newBreathContext(denyPatch)
    await breathPage.getByText('ฉันรับทราบการใช้กล้องและรายละเอียดข้างต้น', { exact: false }).click()
    await breathPage.getByRole('button', { name: 'ยินยอมและเปิดกล้อง' }).click()
    await breathPage.getByText('ยังเข้าถึงกล้องไม่ได้', { exact: false }).waitFor({ timeout: 10000 })
    record('B11 Deny permission → แจ้งเหตุผล + มีปุ่มลองใหม่ (ไม่ crash)', (await breathPage.getByRole('button', { name: 'ลองขอสิทธิ์อีกครั้ง' }).count()) === 1)
    await context.close()
  }

  // ---- การ์ดจากหน้าภาพรวมยังเข้าหน้าประเมินได้ ----
  await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })
  const entryLink = page.getByRole('link', { name: 'เริ่มประเมินความเสี่ยงโรคทางเดินหายใจ →' })
  try {
    await entryLink.waitFor({ timeout: 40000 })
  } catch {
    const overviewText = await page.locator('main').innerText().catch(() => '(ไม่พบ main)')
    throw new Error(`ไม่พบการ์ดในหน้าภาพรวม — เนื้อหา: ${overviewText.replace(/\n/g, ' | ').slice(0, 300)}`)
  }
  record('C1 การ์ดเข้าถึงจากหน้าภาพรวม', await entryLink.isVisible())
  await entryLink.click()
  await page.waitForURL(`${BASE}/respiratory-risk`, { timeout: 10000 })
  record('C2 ลิงก์เข้าสู่หน้าประเมินได้จริง', true)
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
