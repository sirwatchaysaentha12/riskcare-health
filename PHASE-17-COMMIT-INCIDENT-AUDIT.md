# PHASE-17-COMMIT-INCIDENT-AUDIT.md — ตรวจสอบ Commit Incident (7236ddd)

> ตรวจเมื่อ 2026-10-05 · วิธี: `git show --name-status --format=fuller 7236ddd` + `git diff 7236ddd^ 7236ddd` (ไม่มีการแก้ประวัติใด ๆ)

## 1. ข้อมูล Commit

| รายการ | ค่า |
|---|---|
| Commit Hash | `7236ddda19837a9abdda2decf0e1f77538a5dd18` (7236ddd) |
| Commit Message | `feat: HGB vs Ridge comprehensive comparison (experimental)` + body เรื่อง HistGradientBoosting vs Ridge accuracy |
| Author | sirwatchaysaentha12 <sirwatchaysaentha12@gmail.com> |
| AuthorDate | Mon Oct 5 17:00:08 2026 +0700 |
| CommitDate | Mon Oct 5 17:00:08 2026 +0700 |
| Parent | 265b7a9 |
| **Commit message scope** | **mixed** — ข้อความอธิบายงาน OpenAQ/Vertex (HGB vs Ridge) แต่เนื้อหาจริงรวม **Respiratory submission package 37 ไฟล์** ด้วย (เกิดจากการทำงานพร้อมกันขณะไฟล์ถูก stage อยู่) |

## 2. จำนวนไฟล์ (จาก `git diff 7236ddd^ 7236ddd --name-only` = 39 ไฟล์, +2216/−2)

| หมวด | จำนวน | หมายเหตุ |
|---|---|---|
| **Respiratory files (ของระบบนี้)** | **37** | ครบตาม RESPIRATORY-STAGING-LIST.txt 37/37 (ตรวจด้วย comm — ไม่มีเหลือค้าง) |
| **OpenAQ/Vertex files** | **2** | `data/vertex/hgb_vs_ridge_results.json`, `notebooks/hgb_vs_ridge.py` (งานของ actor ที่รันพร้อมกัน) |
| **Sensitive files** | **0** | ไม่มี .env/video/image/password/key (ตรวจ pattern .env/.mp4/.y4m/.webm/research-data/tmp-vitallens) |
| **Unrelated files** | **0** | ไฟล์ทั้ง 39 อยู่ใน 2 หมวดข้างบนครบ (ไม่มีไฟล์อื่นปน) |

## 3. รายชื่อ Respiratory files ทั้ง 37 (ครบตาม staging list)

**Modified (6):** frontend/.env.example · frontend/scripts/auth-smoke.mjs · frontend/src/pages/RespiratoryRiskAssessment.jsx · frontend/src/styles/respiratory-risk.css · frontend/src/utils/measurementContract.js · frontend/tests/e2e-respiratory-risk.mjs

**Phase 9 docs (7):** DATASET-RESEARCH-QUESTIONS.md · EXTERNAL-DATASET-REVIEW.md · DATASET-GOVERNANCE-AND-LICENSE-GATE.md · EXTERNAL-DATA-SCHEMA.md · MODEL-TRAINING-PLAN.md · MODEL-EVALUATION-PLAN.md · UI-CREDIBILITY-REQUIREMENTS.md

**Phase 12 docs (4):** VALIDATION-MODALITY-DECISION.md · COHFACE-LICENSE-REVIEW.md · VALIDATION-APPROVAL-FORM.md · PHASE-12-MODALITY-DECISION-REPORT.md

**Phase 13 docs+scripts (9):** FREE-DATA-SOURCE-REVIEW.md · TRACK-A-APPROVAL-RECORD.md · BIDMC-DATASET-REVIEW.md · BIDMC-QC-REPORT.md · BIDMC-EVALUATION-SPEC.md · BIDMC-SPLIT-MANIFEST.md · TRACK-A-OFFLINE-VALIDATION-REPORT.md · scripts/bidmc-download.mjs · scripts/bidmc-qc-validate.mjs

**Phase 14 docs (9):** COMPETITION-SUBMISSION-README.md · PROJECT-ABSTRACT-TH.md · PROJECT-ABSTRACT-EN.md · JUDGING-FAQ.md · VALIDATION-EVIDENCE-SUMMARY.md · KNOWN-LIMITATIONS-FOR-JUDGES.md · COMPETITION-DEMO-SCRIPT.md · COMPETITION-SUBMISSION-CHECKLIST.md · COMPETITION-READINESS-REPORT.md

**Phase 15 docs (2):** COMPETITION-FILE-MANIFEST.md · COMPETITION-HANDOFF-REPORT.md

## 4. ผลตรวจ Dataset / Raw Video / PII

| รายการ | ผล |
|---|---|
| Dataset content (waveform/video จริง) | ❌ **ไม่มีใน commit** — dataset BIDMC อยู่ที่ `C:\Users\ACER\research-data\bidmc\` นอก Git |
| Raw Video / Face Image | ❌ ไม่มี (tmp-vitallens/ gitignored) |
| PII | ❌ ไม่มี (สแกน @pkw/@gmail/@hotmail/เบอร์โทร ในไฟล์ทั้ง 39 — สะอาด) |
| Password/Key/Token | ❌ ไม่มี (DEMO_TEST_PASSWORD ใน .env.example เป็นค่าว่าง; "TestPass123" literal ถูกลบออกจากเอกสารก่อน stage) |

## 5. ข้อยืนยัน

- **Content integrity: verified** — ไฟล์ Respiratory ครบ 37/37 เนื้อหาล่าสุด (working tree == HEAD สำหรับทุกไฟล์)
- **History rewrite: not performed** — ไม่ amend/rebase/reset/force ใด ๆ ต่อ 7236ddd
- Commit ของ actor อื่น (OpenAQ/Vertex 2 ไฟล์) ไม่ถูกแตะ
- ข้อความ commit mixed scope เป็นข้อจำกัดที่**รับไว้** (แก้ไม่ได้ตามข้อห้าม) — การอ้างอิงขอบเขตที่ถูกต้องคือเอกสาร RESPIRATORY-STAGING-LIST.txt + SUBMISSION-ARCHIVE-MANIFEST.md + PHASE-17-CORRECTIVE-HANDOFF-NOTE.md
