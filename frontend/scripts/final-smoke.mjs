// Phase 22 smoke — เข้าทุกหน้าด้วยบัญชีที่ผู้ใช้ระบุ ตรวจ console error
import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const ACCOUNTS = JSON.parse(process.env.SMOKE_ACCOUNTS || '[]')
const PAGES = [
  { path: '/', name: 'ภาพรวม', expect: /ภาพรวม|ความเสี่ยง|ฝุ่น/ },
  { path: '/appointments', name: 'นัดหมาย', expect: /นัดหมาย|appointment|เพิ่ม/i },
  { path: '/air-quality-trend', name: 'แนวโน้ม', expect: /แนวโน้ม|คุณภาพอากาศ|PM/i },
  { path: '/respiratory-risk', name: 'Respiratory', expect: /ประเมินความเสี่ยงโรคทางเดินหายใจ/ },
]
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-swiftshader'] })
const results = []
for (const account of ACCOUNTS) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 120)) })
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 120)))
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('#login-identifier', account.identifier)
    await page.fill('input[type="password"]', account.password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
    const loggedIn = await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), { timeout: 12000 }).then(() => true).catch(() => false)
    if (!loggedIn) {
      results.push({ account: account.label, login: false, pages: [] })
      continue
    }
    const pageResults = []
    for (const p of PAGES) {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2200)
      const text = await page.locator('main, body').first().innerText().catch(() => '')
      pageResults.push({ page: p.name, renders: text.length > 50, matched: p.expect.test(text) })
    }
    results.push({ account: account.label, login: true, personalizationRisk: null, pages: pageResults, consoleErrors: consoleErrors.slice(0, 3) })
  } catch (error) {
    results.push({ account: account.label, error: String(error).slice(0, 200) })
  }
  await context.close()
}
await browser.close()
console.log(JSON.stringify(results, null, 1))
