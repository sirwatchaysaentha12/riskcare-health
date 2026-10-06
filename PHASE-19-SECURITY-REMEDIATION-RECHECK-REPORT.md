# PHASE-19-SECURITY-REMEDIATION-RECHECK-REPORT.md — Demo Credential Remediation และ Release Gate Recheck

> 2026-10-05 · Phase 19 · สถานะ: **REMEDIATION COMMITTED — RECHECK PASSED**

## 1. HEAD ก่อน/หลัง

| | Hash | หมายเหตุ |
|---|---|---|
| ก่อน remediation | `a407ccf` (feat: validation-based champion model selection — actor อื่น) | HEAD ขยับจาก f872c52 ก่อนเริ่ม Phase 19 (รายงานแล้ว — งาน OpenAQ/Vertex) |
| หลัง remediation | **`f79a5b5`** — fix(security): remove hardcoded demo credential | **ไฟล์เดียว: DEMO-RUNBOOK.md** (+3/−2) |

## 2. Security Fix Commit

| รายการ | ค่า |
|---|---|
| Hash | `f79a5b550cf8cc22917785df679a5a7f9ed846ca` (f79a5b5) |
| Message | `fix(security): remove hardcoded demo credential` |
| Files changed | **DEMO-RUNBOOK.md เท่านั้น** (1 file, +3/−2) — ยืนยันจาก `git show --name-status HEAD` |
| เนื้อหา | ลบ `TestPass123!` ออกจากเอกสาร → ใช้ `DEMO_TEST_PASSWORD` (env) + บันทึก "ไม่บันทึก credential ลงไฟล์ และไม่ log รหัสผ่าน" |

## 3. TestPass ก่อน/หลัง

| ตำแหน่ง | ก่อน | หลัง |
|---|---|---|
| DEMO-RUNBOOK.md | HEAD เก่ามี `TestPass123!` (บรรทัด 13) | ✅ **0** — ใช้ placeholder env |
| frontend/tests/e2e-respiratory-risk.mjs | (แก้แล้วใน Phase 15) | ✅ `process.env.DEMO_TEST_PASSWORD` + Safe Error |
| frontend/scripts/auth-smoke.mjs | (แก้แล้วใน Phase 15) | ✅ เช่นเดียวกัน |
| **ทั้ง repo (git grep TestPass123 ที่ HEAD)** | — | เหลือเฉพาะ **3 จุดในเอกสาร audit** (PHASE-16-HANDOFF, PHASE-17-AUDIT, SUBMISSION-ARCHIVE-MANIFEST) ซึ่งเป็น**ข้อความบันทึกว่า credential ถูกลบแล้ว** — ไม่ใช่ credential ที่ใช้งานได้ใน source |

## 4. Security Scan (หลัง commit — ตาม pattern โจทย์)

`git grep -n -I -E "TestPass123|TestPass|apiKey|secret|Authorization|service_role|BEGIN PRIVATE KEY" -- DEMO-RUNBOOK.md frontend/.env.example frontend/scripts/auth-smoke.mjs frontend/tests/e2e-respiratory-risk.mjs`
- ผล: match เดียวคือ comment อธิบายการใช้ secret ของระบบเดิมใน .env.example — **ไม่มี TestPass123 · ไม่มี password จริง · ไม่มี key/token**

Recheck ทั่ว HEAD (DEMO-RUNBOOK.md, frontend, scripts, tests, *.md): matches ทั้งหมดเป็น (a) ข้อความ audit ว่า credential ถูกลบ (b) form-handling ของระบบเดิม (c) เอกสาร setup ของ actor อื่น (OpenAQ/Vertex) — ไม่แตะ

## 5. Environment Variable

- `DEMO_TEST_PASSWORD` — เป็น**ชื่อ environment variable / placeholder เท่านั้น**
- `.env.example`: `DEMO_TEST_PASSWORD=` (ค่าว่าง)
- ทดสอบแล้ว 2 กรณี: ไม่มี env → **SAFE ERROR** ✅ · มี env (shell session) → E2E **40/40** ✅

## 6. CSS Actor files — excluded ✅

`breathing.css` / `overview.css` (actor อื่นแก้) — **ไม่ถูก stage ไม่ถูก commit** (ยังอยู่ใน working tree ของเจ้าของงาน)

## 7. OpenAQ/Vertex — excluded ✅

ไม่มีไฟล์ OpenAQ/Vertex ถูก stage/commit ใน `f79a5b5` · `notebooks/fetch_hourly_pm25.py` ไม่ถูกแตะ

## 8. Dataset / Raw Video / PII

❌ ไม่มีทั้งหมดใน commit — BIDMC dataset อยู่นอก Git (manifest + SHA-256)

## 9. Tests (รอบ recheck)

respiratoryRiskScore **15/15** · E2E **40/40** (env credential) · Build **PASS** · Lint **exit 0** · `git diff --cached --check` **สะอาด**

## 10. Gate Status

| ระดับ | สถานะ |
|---|---|
| Demo Ready | ✅ **YES** |
| Submission Ready | ✅ **YES** (เอกสารครบ — ข้อควรระวัง breathing/overview.css ≠ baseline ยังอยู่กับเจ้าของงาน) |
| Clinical Ready | ❌ **NO** |
| Public Release Ready | ⚠️ **CONDITIONAL** — งาน actor อื่น (breathing/overview.css) ยัง uncommitted; Push/Tag/Release/Deploy ยังห้าม |
| Professional Review | ⚠️ **REQUIRED** |
| Real Participant Data | ❌ **NO** |

## 11. Push / Tag / Release / Deploy

**ห้ามทั้งหมด** — ยังไม่ดำเนินการใด ๆ (รอคำสั่งผู้ใช้)
