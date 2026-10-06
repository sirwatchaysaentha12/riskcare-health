// Final pages check — เข้าทุกหน้า ตรวจ console error + องค์ประกอบหลัก
import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const results = []
const consoleErrors = []
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 150)) })
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 150)))

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('#login-identifier', 'e2e-breath@test.local')
await page.fill('input[type="password"]', process.env.DEMO_TEST_PASSWORD)
await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), { timeout: 15000 })
console.log('LOGIN OK →', page.url())

const pages = [
  { path: '/', name: 'ภาพรวม (Home)', expect: /ภาพรวม|ความเสี่ยง|ฝุ่น/ },
  { path: '/appointments', name: 'นัดหมาย', expect: /นัดหมาย|appointment|เพิ่ม/i },
  { path: '/air-quality-trend', name: 'แนวโน้ม', expect: /แนวโน้ม|คุณภาพอากาศ|PM2.5|PM/i },
  { path: '/respiratory-risk', name: 'Respiratory Assessment', expect: /ประเมินความเสี่ยงโรคทางเดินหายใจ/ },
]
for (const p of pages) {
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const mainText = await page.locator('main, body').first().innerText().catch(() => '')
  const matched = p.expect.test(mainText)
  results.push({ page: p.name, path: p.path, renders: mainText.length > 50, contentMatched: matched })
  console.log(`${p.name}: renders=${mainText.length > 50} matched=${matched}`)
}
await page.screenshot({ path: 'C:/Users/ACER/competition-export/final-pages-check.png', fullPage: false })
console.log('CONSOLE_ERRORS:', consoleErrors.length, JSON.stringify(consoleErrors.slice(0, 5)))
await browser.close()
