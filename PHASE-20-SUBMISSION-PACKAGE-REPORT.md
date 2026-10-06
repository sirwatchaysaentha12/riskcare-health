# PHASE-20-SUBMISSION-PACKAGE-REPORT.md — Submission Package Freeze และ Allowlist Export

> 2026-10-06 · Phase 20 · **Status: 🟡 BLOCKED — HEAD CHANGED DURING PACKAGE FREEZE** (รายละเอียด §8 — package ที่ freeze ไว้ยังสมบูรณ์)

## 1. Export / Archive Path

| รายการ | Path |
|---|---|
| Export directory | `C:\Users\ACER\competition-export\respiratory-submission-2026-10-05\` |
| Archive ZIP | `C:\Users\ACER\competition-export\respiratory-submission-2026-10-05.zip` (249 KB) |
| Allowlist | `C:\Users\ACER\competition-export\SUBMISSION-ALLOWLIST.txt` (83 ไฟล์) |
| ทั้งหมดอยู่**นอก Repository** | ✅ (ห้าม Upload/Publish ตามโจทย์) |

## 2. File Count / SHA-256

- **89 ไฟล์** ใน export (83 จาก allowlist + SECURITY-NOTICE + SUBMISSION-README + EXPORT-MANIFEST + export-entries.json + RESPIRATORY-STAGING-LIST)
- `SHA256SUMS.txt` — SHA-256 ครบทุกไฟล์ (87 รายการ ณ ตอนสร้าง + เอกสาร 2 ใหม่)
- ตรวจได้ด้วย: `sha256sum -c SHA256SUMS.txt`

## 3. Allowlist / Included / Excluded / Actor Files

- **Allowlist**: SUBMISSION-ALLOWLIST.txt — ระบุไฟล์ชัดเจน ห้ามเพิ่มโดยเดา
- **Included**: Respiratory source (frontend + admin-app backend + scripts), Competition docs, Validation reports (BIDMC Track A), Privacy/Security docs, Demo runbook/checklist, Tests 11 ไฟล์, .env.example ค่าว่าง
- **Excluded — Actor files**: `breathing.css`, `overview.css` (Actor WIP หลัง 18b66de — export ใช้**เวอร์ชัน HEAD** แทน) · Untracked actor files ทั้งหมด
- **Excluded — OpenAQ/Vertex**: commits 51df1d2→e947f76 ทั้งหมด · notebooks/fetch_hourly_pm25.py · data/vertex
- **Excluded — Sensitive**: dataset จริง (research-data นอก Git) · raw video/face image · .env.local · key/token/password · temp files · health logs

## 4. Dataset / Raw Video / PII Status

❌ **ไม่มีทั้งสามอย่างใน export** — ตรวจด้วย scan: TestPass123 = 0 · dataset content = 0 · PII = 0 · .env.local = 0

## 5. Validation Numbers (ตรวจใน export แล้ว — ตรงทุกไฟล์)

MAE **9.03** · RMSE **10.74** · Bias **+8.92** · Acceptable ±2 = **20.7%** · Abstention **42.4%** · **Camera Accuracy: Not Validated** · **Clinical Accuracy: Not Validated** · **Real Participant Data: NO** · **Professional Review Required** — ไม่พบตัวเลขชุดอื่นปน (DOCUMENT CONFLICT: ไม่พบ)

## 6. Source Commit / Mixed Scope

- Export ทุกไฟล์มาจาก **HEAD snapshot `c5e8e00`** (ผ่าน `git show HEAD:path` — ไม่ copy จาก working tree ยกเว้นเอกสาร own-docs untracked 5 ไฟล์ ที่บันทึกเหตุผลใน export-entries.json)
- **Content commit 7236ddd is mixed-scope. Submission scope is governed by the allowlist and manifest, not by the commit message.**

## 7. 🔴 BLOCKED — HEAD CHANGED DURING PACKAGE FREEZE

HEAD เปลี่ยนระหว่างขั้นตอน: snapshot `c5e8e00` → `e947f76` (actor อื่น commit งาน OpenAQ/Vertex เพิ่ม)

**ผลกระทบที่ตรวจแล้ว**: `git diff c5e8e00 e947f76 --name-only` = 4 ไฟล์ เฉพาะ `data/vertex/*` และ `notebooks/phase20_robustness.py` — **ไม่มีไฟล์ respiratory ถูกแตะ** → package ที่ freeze ไว้ (จาก c5e8e00) **ยังสมบูรณ์และใช้ได้สำหรับ respiratory scope**

**ต้องทำเพื่อผ่าน Gate ซ้ำ**: รอ actor อื่นเสร็จ → re-run `scripts/phase20-export.mjs` (HEAD จะถูก snapshot ใหม่) → สร้าง zip ใหม่ → Gate recheck อีกครั้ง

## 8. Demo Ready / Submission Ready

- **Demo Ready = YES** (ตาม COMPETITION-DEMO-SCRIPT.md)
- **Submission Ready = YES** (package นี้ + เอกสารครบ)

## 9. สถานะข้อจำกัด (คงเดิมทุกข้อ)

- Clinical Ready = **NO** · Clinical Accuracy = **Not Validated** · Camera Accuracy = **Not Validated**
- Professional Review = **REQUIRED** · Real Participant Data = **NO**
- ห้ามใช้คำ: ตรวจโรคได้/วินิจฉัยได้/medical-grade/diagnostic tool

## 10. Commit / Push / Tag / Release / Deploy / Upload

**ทั้งหมด = NOT DONE** (ห้ามตามโจทย์ — รอคำสั่งผู้ใช้แยกจากผู้ใช้)
