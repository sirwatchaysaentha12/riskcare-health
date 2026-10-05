// Download BIDMC CSV bundle (Signals/Breaths/Numerics × 53 subjects) with parallel connections + retry
// เฉพาะไฟล์ที่ Track A ต้องใช้ — ไม่โหลด waveform .dat / .mat ที่ไม่จำเป็น
// รัน: node scripts/bidmc-download.mjs
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'

const BASE = 'https://physionet.org/files/bidmc/1.0.0/bidmc_csv'
const OUT_DIR = 'C:\\Users\\ACER\\research-data\\bidmc\\bidmc_csv'
const CONCURRENCY = 6
const RETRIES = 3

const subjects = Array.from({ length: 53 }, (_, i) => String(i + 1).padStart(2, '0'))
const files = []
for (const s of subjects) {
  files.push(`bidmc_${s}_Signals.csv`, `bidmc_${s}_Breaths.csv`, `bidmc_${s}_Numerics.csv`)
}

async function downloadOne(file) {
  const dest = path.join(OUT_DIR, file)
  if (existsSync(dest) && statSync(dest).size > 200) return { file, status: 'exists', bytes: statSync(dest).size }
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(`${BASE}/${file}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      await pipeline(response.body, createWriteStream(dest))
      return { file, status: 'ok', bytes: statSync(dest).size }
    } catch (error) {
      if (attempt === RETRIES) return { file, status: `error: ${error.message}` }
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
}

const results = []
let next = 0
async function worker() {
  while (next < files.length) {
    const file = files[next++]
    const result = await downloadOne(file)
    results.push(result)
    process.stdout.write(`[${results.length}/${files.length}] ${result.file} ${result.status} ${result.bytes ?? ''}\n`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const errors = results.filter((r) => r.status.startsWith('error'))
console.log(`\nDONE: ${results.length - errors.length} ok, ${errors.length} errors`)
if (errors.length) console.log(errors)
process.exit(errors.length ? 1 : 0)
