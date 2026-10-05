# TRACK-A-APPROVAL-RECORD.md — บันทึกการอนุมัติ Track A (BIDMC/PhysioNet Signal Validation)

> บันทึก 2026-10-04 · ผู้อนุมัติ: **ผู้ใช้โครงการ (โดยตรง)** — คำตัดสินใจมาจากคำสั่งของผู้ใช้เองในแชตวันที่ 2026-10-04 (Phase 13) ซึ่งระบุครบทุกช่องที่ VALIDATION-APPROVAL-FORM.md กำหนด
> หมายเหตุ: ตามกติกา "ห้าม AI ติ๊ก Approval แทนผู้ใช้" — เอกสารนี้**ไม่ได้ติ๊กแทน** แต่**ถอดร้อยคำตัดสินใจที่ผู้ใช้ประกาศเอง**เป็นลายลักษณ์อักษรเพื่อใช้อ้างอิง

## 1. คำประกาศของผู้อนุมัติ (ถอดร้อยคำตรงจากคำสั่ง Phase 13)

> "คำตัดสินใจ: เลือก Track A — Signal Validation ด้วย BIDMC/PhysioNet"
> เหตุผลที่ผู้ใช้ระบุ: BIDMC เข้าถึงได้โดยไม่เสียค่าดาวน์โหลด · Official License ระบุชัดเจน · มี Impedance Respiration, PPG, ECG และ Manual Breath Annotations · เหมาะกับ Signal-processing Validation
> ข้อจำกัดที่ผู้ใช้ระบุเอง: BIDMC ไม่มี RGB Video · **ห้ามอ้าง Camera Accuracy หรือ End-to-end Video Accuracy** · COHFACE ยังไม่เคลียร์สิทธิ์ Competition/Presentation · ยังไม่ใช้ COHFACE ในการแข่งขัน
> ขอบเขต: **Signal-processing validation only**

## 2. การยืนยันบังคับของ VALIDATION-APPROVAL-FORM.md (ถอดจากคำสั่งผู้ใช้)

| รายการ | สถานะ | แหล่งอ้างอิง |
|---|---|---|
| Selected Track: A — BIDMC/PhysioNet Signal Validation only | ✅ APPROVED | ข้อความ "เลือก Track A" |
| Purpose: Offline Signal Validation only | ✅ APPROVED | "ขอบเขต: Signal-processing validation only" |
| Training | ❌ **NOT APPROVED** | ข้อห้าม "Train" |
| Production Model Replacement | ❌ **NOT APPROVED** | ข้อห้าม "เปลี่ยน Production Model" |
| Storage: Outside Git | ✅ ยืนยัน | กำหนด path `C:\Users\ACER\research-data\bidmc\` + "ห้ามเก็บ Dataset ใน Repository" |
| Camera Accuracy Claim | ❌ **NOT ALLOWED** | "ห้ามอ้าง Camera Accuracy หรือ End-to-end Video Accuracy" |
| Clinical Validation Claim | ❌ **NOT ALLOWED** | ข้อห้าม "อ้าง Clinical Accuracy" |
| Research Consent (อาสาสมัครจริงของโครงการ) | ไม่เกี่ยวข้องใน Phase นี้ (ไม่ใช้ข้อมูลอาสาสมัครจริง) | ข้อห้าม |
| Professional Review | ⚠️ **PENDING — ยังต้องดำเนินการ** ก่อนตีความผลเชิงคลินิกใด ๆ (validation นี้เป็น non-clinical technical validation) | — |

## 3. ขอบเขตที่อนุมัติ

- ✅ Download BIDMC จาก PhysioNet ไปที่ `C:\Users\ACER\research-data\bidmc\` (นอก Git)
- ✅ QC waveform/reference
- ✅ Signal-processing evaluation: รัน `computeBreathingRate` (อัลกอริทึมนับ peak/periodicity เดิม) กับสัญญาณ impedance respiration เทียบ manual breath annotations + numerics RR
- ✅ รายงานผลเป็น **Track A: Signal Processing Only**

## 4. สิ่งที่ยังห้าม (คงอยู่)

- ❌ อ้าง Camera Accuracy / Pose Accuracy / End-to-end Video Accuracy
- ❌ อ้าง Clinical Accuracy / Medical-grade / Diagnostic
- ❌ Train / เปลี่ยน production model / แก้ RR Formula, Quality Gate, Risk Score
- ❌ แก้ threshold หลังเห็นผล · ❌ เก็บ dataset ใน Git · ❌ แตะ OpenAQ/Vertex และ notebooks/fetch_hourly_pm25.py
- ❌ ใช้ COHFACE ในการแข่งขัน (ยัง NOT CLEARED FOR COMPETITION USE)
