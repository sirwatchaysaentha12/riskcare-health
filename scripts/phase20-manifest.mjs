// Phase 20 — SHA256SUMS + EXPORT-MANIFEST ของ submission package
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const ROOT = 'C:/Users/ACER/competition-export/respiratory-submission-2026-10-05'
const HEAD_SNAP = 'c5e8e00dee811835b6f0586a81019e2a60e8415f'

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

// SHA256SUMS.txt
const sums = []
for (const p of walk(ROOT)) {
  const rel = path.relative(ROOT, p).split(path.sep).join('/')
  sums.push(createHash('sha256').update(readFileSync(p)).digest('hex') + '  ' + rel)
}
writeFileSync(path.join(ROOT, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
console.log('SHA256SUMS.txt:', sums.length, 'ไฟล์')

// EXPORT-MANIFEST.md
const entries = JSON.parse(readFileSync(path.join(ROOT, 'export-entries.json'), 'utf8')).entries
const reasons = {
  source: 'Respiratory source code ตาม manifest §1 — จาก git HEAD (ภูมิคุ้มกัน actor WIP)',
  tests: 'ชุดทดสอบที่เกี่ยวข้องตาม manifest §1 — จาก git HEAD',
  docs: 'เอกสาร competition/governance ตาม manifest §1 — จาก git HEAD',
  validation: 'รายงาน validation Track A ตาม manifest §1 — จาก git HEAD',
  demo: 'Demo runbook/checklist (หลัง security fix f79a5b5) — จาก git HEAD',
  manifests: 'Manifest กำหนดขอบเขต — RESPIRATORY-STAGING-LIST จาก working tree (untracked own file ไม่ใช่ actor WIP) ที่เหลือจาก git HEAD',
}
const byCat = {}
for (const e of entries) byCat[e.category] = (byCat[e.category] || 0) + 1

let md = '# EXPORT-MANIFEST.md — Submission Package Freeze (Phase 20)\n\n'
md += '> Freeze ณ HEAD snapshot: `' + HEAD_SNAP + '` · Export: 2026-10-05 · รวม ' + entries.length + ' ไฟล์\n\n'
md += '**Content commit 7236ddd is mixed-scope. Submission scope is governed by the allowlist and manifest, not by the commit message.**\n\n'
md += '## Files (INCLUDE)\n\n| Path | Source Commit | Category | Include/Exclude | Reason |\n|---|---|---|---|---|\n'
for (const e of entries) {
  md += '| ' + e.repoPath + ' | ' + (e.source === 'HEAD' ? 'HEAD (c5e8e00)' : e.source) + ' | ' + e.category + ' | INCLUDE | ' + reasons[e.category] + ' |\n'
}
md += '\n## Excluded (ไม่อยู่ใน export)\n\n'
md += '- Dataset จริง (research-data/ นอก Git) · Raw video/Face image (tmp-vitallens gitignored) · .env.local · API key/Token · Password · Temp files · Health logs ระบุตัวคน\n'
md += '- OpenAQ/Vertex ทั้งหมด: commits 51df1d2/bd4b863/a701761/e8c54cb/52edde1/265b7a9/f872c52 · notebooks/fetch_hourly_pm25.py · data/vertex\n'
md += '- breathing.css / overview.css (Actor WIP หลัง 18b66de — ใช้เวอร์ชัน HEAD แทน) · Untracked actor files ทั้งหมด\n'
md += '- งาน admin-app ที่ไม่เกี่ยวข้อง · .vscode · pm25Personalization test · admin-app/cd\n\n'
md += '## สถานะ (ตรวจ ณ freeze)\n\nMAE 9.03 · RMSE 10.74 · Bias +8.92 · Acceptable ±2 = 20.7% · Abstention 42.4% · Camera Accuracy: Not Validated · Clinical Accuracy: Not Validated · Real Participant Data: NO — REQUIRES PROFESSIONAL REVIEW\n'
writeFileSync(path.join(ROOT, 'EXPORT-MANIFEST.md'), md)
console.log('EXPORT-MANIFEST.md:', entries.length, 'รายการ')
