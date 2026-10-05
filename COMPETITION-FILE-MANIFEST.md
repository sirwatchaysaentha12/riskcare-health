# COMPETITION-FILE-MANIFEST.md — รายการไฟล์สำหรับการส่ง (Include / Exclude)

> Phase 15 · 2026-10-04 · ใช้ประกอบการ stage ไฟล์เมื่อผู้ใช้สั่ง commit (ยังไม่ commit)

## 1. INCLUDE — Source Code (Respiratory)

| ไฟล์ | สถานะ |
|---|---|
| frontend/src/utils/respiratoryRiskScore.ts · signalQuality.js · measurementContract.js · validationMetrics.js · breathingRate.js (เดิม) · riskQuestionnaire.js (เดิม) · cameraQuality.js (เดิม) | committed/committed เดิม |
| frontend/src/components/RrCameraCapture.jsx · CameraConsent.jsx | committed |
| frontend/src/pages/RespiratoryRiskAssessment.jsx · Overview.jsx (การ์ด) · App.jsx (route) | committed + modified (Phase 9/15) |
| frontend/src/services/vitalSigns.js · styles/respiratory-risk.css | committed + modified |
| frontend/tests/respiratoryRiskScore.test.mjs · signalQuality · measurementContract · validationMetrics · e2e-respiratory-risk.mjs (env credential) · api-vital-signs-security · runner-timeout-cleanup | committed + modified |
| frontend/scripts/auth-smoke.mjs (env credential — Phase 15) | modified |
| frontend/.env.example (+DEMO_TEST_PASSWORD= ค่าว่าง) · vite.config.js (proxy) · .gitignore · admin-app/.gitignore | modified |
| admin-app/src/app/api/vital-signs/route.ts · src/lib/vitalSigns.ts · scripts/vital_signs_runner.py · scripts/bidmc-download.mjs · scripts/bidmc-qc-validate.mjs | committed/ใหม่ |

## 2. INCLUDE — Competition & Governance Documents (24 ฉบับ .md)

COMPETITION-SUBMISSION-README · PROJECT-ABSTRACT-TH · PROJECT-ABSTRACT-EN · JUDGING-FAQ · VALIDATION-EVIDENCE-SUMMARY · KNOWN-LIMITATIONS-FOR-JUDGES · COMPETITION-DEMO-SCRIPT · COMPETITION-SUBMISSION-CHECKLIST · COMPETITION-READINESS-REPORT · FINAL-PROJECT-REPORT · PROJECT-STATUS-FINAL · FINAL-RELEASE-GATE-REPORT · VALIDATION-PROTOCOL · PARTICIPANT-CONSENT-PLAN · DATASET-SCHEMA · CLINICAL-INTERPRETATION-GUIDE · MODEL-PROVENANCE · THIRD-PARTY-NOTICES · PRIVACY-SECURITY-CHECKLIST · DATA-RETENTION-AND-DELETION · CONSENT-IMPLEMENTATION-NOTES · DATASET-RESEARCH-QUESTIONS · EXTERNAL-DATASET-REVIEW · DATASET-GOVERNANCE-AND-LICENSE-GATE · EXTERNAL-DATA-SCHEMA · MODEL-TRAINING-PLAN · MODEL-EVALUATION-PLAN · UI-CREDIBILITY-REQUIREMENTS · VALIDATION-MODALITY-DECISION · COHFACE-LICENSE-REVIEW · VALIDATION-APPROVAL-FORM · PHASE-12-MODALITY-DECISION-REPORT · TRACK-A-APPROVAL-RECORD · FREE-DATA-SOURCE-REVIEW · BIDMC-DATASET-REVIEW · BIDMC-QC-REPORT · BIDMC-EVALUATION-SPEC · BIDMC-SPLIT-MANIFEST · TRACK-A-OFFLINE-VALIDATION-REPORT · DATASET-APPROVAL-PACKET · DATASET-APPROVAL-CHECKLIST · ERROR-MATRIX · RELEASE-READINESS · DEMO-RUNBOOK · DEMO-CHECKLIST

## 3. EXCLUDE — Sensitive (ห้ามเข้า submission โดยเด็ดขาด)

- ❌ Dataset จริงทุกชนิด — BIDMC อยู่ที่ `C:\Users\ACER\research-data\bidmc\` (นอก Git, มี manifest+checksum)
- ❌ Raw video / Face image / คลิปใบหน้าจริง (`tmp-vitallens/` — gitignored)
- ❌ `.env` / `.env.local` / ค่า key-token จริง (เฉพาะ `.env.example` ค่าว่าง/placeholder)
- ❌ Password/credential ใด ๆ (รหัสผ่านเดิมของบัญชีทดสอบถูกลบออกจาก source แล้ว — Phase 15)
- ❌ Logs ที่มีข้อมูลสุขภาพ/ผลวัดรายบุคคล (validation-results.json อยู่นอก Git)
- ❌ Temporary files (tmp-vitallens/, /tmp/*)

## 4. EXCLUDE — Unrelated (งานของ session/actor อื่น — ไม่แตะ)

- ❌ OpenAQ/Vertex: commits 51df1d2, bd4b863, a701761, e8c54cb · `notebooks/fetch_hourly_pm25.py` · `notebooks/*` · `data/vertex/` · `data program.md` ฯลฯ
- ❌ admin-app งานไม่เกี่ยวข้อง: `package.json`, `src/app/api/stations/route.ts`, `tsconfig.json`, `src/app/admin/`, `scripts/check-openaq-health.mjs` ฯลฯ
- ❌ `.vscode/settings.json`, `admin-app/cd` (ลบ), `admin-app/supabase/.temp/cli-latest`, `frontend/tests/pm25Personalization.test.mjs` (แก้เดิมก่อนหน้า — รอเจ้าของงาน)
- ❌ Untracked ของ actor อื่น: `.agents/`, `.claude/skills/`, `.zcodeignore`, `docs/`, `frontend/design.md`, `skills-lock.json`, `.impeccable/`

## 5. ไฟล์ต้องรีวิวก่อน commit (ผู้ใช้ตัดสินใจ)

- `frontend/tests/pm25Personalization.test.mjs` (modified — งานก่อนหน้า ไม่ใช่ของระบบนี้)
- `docs/RESPIRATORY-RISK-SPEC.md` (untracked — สเปคเก่า session ก่อนหน้า)
- `admin-app/cd` (deleted — ยืนยันว่าตั้งใจลบหรือไม่)
