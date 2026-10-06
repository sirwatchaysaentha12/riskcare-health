// Phase 20 — Export submission package จาก git HEAD snapshot (ไม่ใช่ working tree)
// ทุกไฟล์อ่านจาก `git show HEAD:<path>` — ภูมิคุ้มกัน actor WIP ใน working tree
// ตรวจ HEAD ก่อนและหลัง export — ถ้าเปลี่ยน = BLOCKED
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const REPO = 'C:\\Users\\ACER\\projectweb'
const EXPORT_ROOT = 'C:\\Users\\ACER\\competition-export\\respiratory-submission-2026-10-05'
const ALLOWLIST = 'C:\\Users\\ACER\\competition-export\\SUBMISSION-ALLOWLIST.txt'

const headBefore = execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim()
console.log('HEAD at freeze start:', headBefore)

const allowPaths = readFileSync(ALLOWLIST, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))

// เอกสารของเราเองที่ยัง untracked (ไม่เคย commit — ไม่ใช่ actor WIP): copy จาก working tree พร้อมบันทึกเหตุผล
const WORKING_TREE_DOCS = new Set([
  'DATASET-APPROVAL-PACKET.md',
  'DATASET-APPROVAL-CHECKLIST.md',
  'FINAL-RELEASE-GATE-REPORT.md',
  'PHASE-18-FINAL-RELEASE-GATE-REPORT.md',
  'PHASE-19-SECURITY-REMEDIATION-RECHECK-REPORT.md',
])

function categoryFor(repoPath) {
  if (repoPath.startsWith('frontend/tests/')) return 'tests'
  if (repoPath === 'DEMO-RUNBOOK.md' || repoPath === 'DEMO-CHECKLIST.md') return 'demo'
  if (repoPath === 'COMPETITION-FILE-MANIFEST.md' || repoPath === 'SUBMISSION-ARCHIVE-MANIFEST.md') return 'manifests'
  if (/^(TRACK-A-OFFLINE-VALIDATION|BIDMC-QC|BIDMC-SPLIT-MANIFEST|BIDMC-EVALUATION-SPEC|BIDMC-DATASET|VALIDATION-EVIDENCE-SUMMARY|ERROR-MATRIX|FREE-DATA-SOURCE-REVIEW)\b/.test(path.basename(repoPath))) return 'validation'
  if (repoPath.endsWith('.md')) return 'docs'
  return 'source'
}

const entries = []
let headChanged = false
for (const repoPath of allowPaths) {
  const headNow = execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim()
  if (headNow !== headBefore) { headChanged = true; break }
  let content, source = 'HEAD'
  if (WORKING_TREE_DOCS.has(repoPath)) {
    // เอกสารของเราเองที่ untracked — copy จาก working tree (บันทึกเหตุผลตามโจทย์)
    content = readFileSync(path.join(REPO, repoPath))
    source = 'working-tree (untracked own doc — not actor WIP, not in HEAD)'
  } else {
    try {
      content = execSync(`git show HEAD:"${repoPath}"`, { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
    } catch {
      // ไฟล์ไม่อยู่ใน HEAD (ไม่เคย commit หรือถูก actor คู่ขนานลบ) — บันทึกสถานะและข้าม
      entries.push({ repoPath, category: categoryFor(repoPath), status: 'MISSING-IN-HEAD', source: 'none', bytes: 0, sha256: null })
      continue
    }
  }
  const category = categoryFor(repoPath)
  const dest = path.join(EXPORT_ROOT, category, repoPath)
  mkdirSync(path.dirname(dest), { recursive: true })
  writeFileSync(dest, content)
  const sha = createHash('sha256').update(content).digest('hex')
  entries.push({ repoPath, category, status: 'ok', source, bytes: content.length, sha256: sha })
}
if (headChanged) {
  console.log('BLOCKED — HEAD CHANGED DURING PACKAGE FREEZE')
  process.exit(2)
}

// RESPIRATORY-STAGING-LIST.txt — ไฟล์ของเราเองใน working tree (untracked ไม่ใช่ actor WIP) — บันทึกเหตุผลไว้
const stagingListPath = path.join(REPO, 'RESPIRATORY-STAGING-LIST.txt')
const stagingContent = readFileSync(stagingListPath)
const stagingDest = path.join(EXPORT_ROOT, 'manifests', 'RESPIRATORY-STAGING-LIST.txt')
mkdirSync(path.dirname(stagingDest), { recursive: true })
writeFileSync(stagingDest, stagingContent)
entries.push({
  repoPath: 'RESPIRATORY-STAGING-LIST.txt', category: 'manifests', status: 'ok (working-tree copy — untracked own file, not actor WIP; HEAD has no committed version)',
  bytes: stagingContent.length, sha256: createHash('sha256').update(stagingContent).digest('hex'),
})

writeFileSync(path.join(EXPORT_ROOT, 'export-entries.json'), JSON.stringify({ headAtFreeze: headBefore, count: entries.length, entries }, null, 2))
const errors = entries.filter((e) => e.status.startsWith('ERROR'))
console.log(`EXPORT DONE: ${entries.length} files (${errors.length} errors) -> ${EXPORT_ROOT}`)
if (errors.length) console.log(errors)
process.exit(errors.length ? 1 : 0)
