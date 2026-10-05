# PHASE-12-MODALITY-DECISION-REPORT.md

> วันที่: 2026-10-04

```text
Phase: 12 — Modality Decision and Validation Approval
Status: BLOCKED (เอกสารตัดสินใจครบแล้ว — รอผู้ใช้เลือกทางเลือกและติ๊กอนุมัติ)
```

## BIDMC

- RGB Video available: **NO** (มีเฉพาะ PPG + impedance respiration + ECG waveform @125 Hz)
- Signal Reference available: **YES** — manual breath annotations (2 annotators อิสระ) + impedance RR + HR จาก ECG
- Camera Pipeline comparable: **NO** (`NOT COMPARABLE — DATA MODALITY MISMATCH`)
- License: ODC-By 1.0 (open — competition ได้)
- Decision: เสนอเป็น **Track A (Signal Algorithm Validation only)** — รอผู้ใช้เลือก/อนุมัติ

## COHFACE

- Video available: **YES** (RGB webcam 640×480 @20 Hz, 40 subjects / 160 คลิป)
- License: **COHFACE EULA — non-commercial research only** (EULA ฉบับเต็มส่งหลังยื่นคำขอ)
- Competition use: **NOT CLEARED FOR COMPETITION USE** — ไม่ปรากฏข้อความอนุญาต competition/presentation บนหน้า public
- Access: restricted — ยื่นคำขอผ่าน Zenodo (ผู้ลงนามตำแหน่งถาวร + อีเมลองค์กร)
- Decision: เสนอเป็น **Track B (Video Domain Validation)** — มีเงื่อนไข EULA ต้องตรวจก่อน รอผู้ใช้เลือก/อนุมัติ

## Selected Track

- **A / B / C / NONE: NONE** — ผู้ใช้ยังไม่ได้เลือก (ห้ามตีความ "เริ่ม Phase 12" เป็นการอนุมัติ)

## Approval

- Dataset approved: **NO**
- Purpose approved: **NO**
- Download approved: **NO**
- Training approved: **NO**
- Production replacement approved: **NO**
- Professional review: **ยังต้องดำเนินการ**

## Files created/updated

- `VALIDATION-MODALITY-DECISION.md` (ใหม่ — Decision Matrix A/B/C + ขั้นตอนหลังอนุมัติ + ข้อห้ามรวม metrics)
- `COHFACE-LICENSE-REVIEW.md` (ใหม่ — ตรวจจาก Idiap + Zenodo จริง, ระบุ 4 ประเด็นที่ต้องอ่าน EULA ฉบับจริง)
- `VALIDATION-APPROVAL-FORM.md` (ใหม่ — แบบฟอร์มเลือก A/B/C + การยืนยันบังคับ, ยังไม่กรอก)
- ไม่มี production code เปลี่ยน

## Next allowed action

- ผู้ใช้เลือกทางเลือก A/B/C และติ๊กอนุมัติใน `VALIDATION-APPROVAL-FORM.md` (ครบช่องบังคับทุกข้อ)
- หลังอนุมัติ: ดำเนินตามขั้นตอนของ track ที่เลือก (ดู VALIDATION-MODALITY-DECISION.md "ขั้นตอนหลังอนุมัติ")

## Blocked

- Download ทุก dataset (รวม BIDMC และ COHFACE)
- QC / Evaluation / Metrics ทุกช่อง: NOT AVAILABLE — NO VALIDATED RUN
- Train / Production replacement ทุกกรณี

## คงเดิม

- Production model ยังไม่เปลี่ยน · RR Formula/Quality Gate/Risk Score ยังไม่ถูกแตะ
- OpenAQ/Vertex (commit bd4b863 และ notebooks/fetch_hourly_pm25.py) ไม่ถูกแตะ
- ไม่มีการ commit/push ใน Phase นี้

```text
Real Participant Data: NO — REQUIRES PROFESSIONAL REVIEW
BLOCKED — WAITING FOR MODALITY SELECTION AND DATASET APPROVAL
ยังไม่ Download และยังไม่ Train
```
