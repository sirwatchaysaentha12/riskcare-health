# SUBMISSION-ARCHIVE-MANIFEST.md — รายการไฟล์ใน Submission Archive (สถานะจริง ณ Commit)

> Phase 16 · 2026-10-04 · **Commit ที่บรรจุ submission package จริง: `7236ddd`** (ดูหมายเหตุเหตุการณ์ §4 และ PHASE-16-COMMIT-HANDOFF-REPORT.md)

## 1. Include — อยู่ใน commit แล้ว ✅ (37 ไฟล์)

### Respiratory Source Code
- frontend/src/pages/RespiratoryRiskAssessment.jsx (หน้าประเมิน 3 สัญญาณ)
- frontend/src/components/RrCameraCapture.jsx · CameraConsent.jsx (commit 85fa8ef ยุคแรก)
- frontend/src/utils/respiratoryRiskScore.ts · signalQuality.js · measurementContract.js · validationMetrics.js · breathingRate.js · riskQuestionnaire.js · cameraQuality.js
- frontend/src/services/vitalSigns.js · frontend/src/styles/respiratory-risk.css
- admin-app/src/app/api/vital-signs/route.ts · admin-app/src/lib/vitalSigns.ts
- scripts/bidmc-download.mjs · scripts/bidmc-qc-validate.mjs
- frontend/.env.example (DEMO_TEST_PASSWORD= ค่าว่าง) · frontend/scripts/auth-smoke.mjs (env credential)
- frontend/tests/e2e-respiratory-risk.mjs (env credential) · tests/unit 7 ไฟล์ (respiratoryRiskScore/signalQuality/measurementContract/validationMetrics/breathingRate/cameraQuality/riskQuestionnaire)

### Competition Documents (9)
COMPETITION-SUBMISSION-README · PROJECT-ABSTRACT-TH · PROJECT-ABSTRACT-EN · JUDGING-FAQ · VALIDATION-EVIDENCE-SUMMARY · KNOWN-LIMITATIONS-FOR-JUDGES · COMPETITION-DEMO-SCRIPT · COMPETITION-SUBMISSION-CHECKLIST · COMPETITION-READINESS-REPORT

### Validation Reports (Track A)
TRACK-A-OFFLINE-VALIDATION-REPORT · BIDMC-QC-REPORT · BIDMC-SPLIT-MANIFEST · BIDMC-EVALUATION-SPEC · BIDMC-DATASET-REVIEW · FREE-DATA-SOURCE-REVIEW · TRACK-A-APPROVAL-RECORD · VALIDATION-EVIDENCE-SUMMARY

### Privacy/Security & Governance Documents
PRIVACY-SECURITY-CHECKLIST · DATA-RETENTION-AND-DELETION · CONSENT-IMPLEMENTATION-NOTES · MODEL-PROVENANCE · THIRD-PARTY-NOTICES · DATASET-GOVERNANCE-AND-LICENSE-GATE · EXTERNAL-DATASET-REVIEW · DATASET-RESEARCH-QUESTIONS · EXTERNAL-DATA-SCHEMA · MODEL-TRAINING-PLAN · MODEL-EVALUATION-PLAN · UI-CREDIBILITY-REQUIREMENTS · VALIDATION-PROTOCOL (เดิม) · PARTICIPANT-CONSENT-PLAN (เดิม) · DATASET-SCHEMA (เดิม) · CLINICAL-INTERPRETATION-GUIDE (เดิม)

### Demo & Handoff
DEMO-RUNBOOK (placeholder credential) · DEMO-CHECKLIST · COMPETITION-FILE-MANIFEST · COMPETITION-HANDOFF-REPORT · VALIDATION-MODALITY-DECISION · COHFACE-LICENSE-REVIEW · VALIDATION-APPROVAL-FORM · PHASE-12-MODALITY-DECISION-REPORT · ERROR-MATRIX · RELEASE-READINESS · FINAL-PROJECT-REPORT · PROJECT-STATUS-FINAL · FINAL-RELEASE-GATE-REPORT

## 2. Exclude — Sensitive (ยืนยันไม่อยู่ใน commit)

- ❌ Dataset จริง (BIDMC = `C:\Users\ACER\research-data\bidmc\` นอก Git, มี manifest.json)
- ❌ Raw video / Face image (`tmp-vitallens/` gitignored)
- ❌ `.env` / `.env.local` (ไม่มีใน git ls-files)
- ❌ Password/API Key/Token (รหัสผ่านเดิมของบัญชีทดสอบ หมดจาก repo — Phase 15; DEMO_TEST_PASSWORD ใน .env.example เป็นค่าว่าง)
- ❌ Temp files / Health logs (validation-results.json อยู่นอก Git)

## 3. Exclude — Unrelated (งาน actor อื่น — ไม่รวมใน manifest นี้)

- ❌ OpenAQ/Vertex: commits 51df1d2, bd4b863, a701761, e8c54cb, 52edde1 · notebooks/fetch_hourly_pm25.py · data/vertex/ · notebooks/*
- ❌ งาน admin-app ที่ไม่เกี่ยวข้อง (package.json, stations route, tsconfig, admin/, scripts/อื่น ๆ)
- ❌ .vscode/settings.json · frontend/tests/pm25Personalization.test.mjs (งานเก่าก่อนหน้า) · admin-app/cd (ลบ)

## 4. หมายเหตุเหตุการณ์ (Incident Note) — สำคัญ

Commit `7236ddd` ("feat: HGB vs Ridge comprehensive comparison") ของ actor ที่รันพร้อมกัน **ครอบคลุมไฟล์ submission package ของระบบนี้ด้วย (37 ไฟล์ — ครบตาม RESPIRATORY-STAGING-LIST.txt เนื้อหาล่าสุด)** เนื่องจากทำงานพร้อมกันขณะไฟล์ของระบบนี้ถูก stage อยู่
- ข้อความ commit ไม่ได้สะท้อนเนื้อหาทั้งหมด (ผสมงาน HGB comparison กับ respiratory submission package)
- ตรวจยืนยัน: ไฟล์ครบ 37/37 เนื้อหาล่าสุด · ไม่มีไฟล์ sensitive/unrelated หลุดเข้าไป (ตรวจ name-only ทั้ง commit)
- **แก้ไขข้อความ commit ไม่ได้** (ห้าม amend/rebase commit ของ actor อื่นตามข้อห้าม) — จึงบันทึกเหตุการณ์ไว้ในเอกสารนี้และ PHASE-16-COMMIT-HANDOFF-REPORT.md
