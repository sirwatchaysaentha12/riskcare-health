# UI-CREDIBILITY-REQUIREMENTS.md — ข้อกำหนดความโปร่งใสของหน้าจอ + สถานะการ implement

> Phase 9 · อัปเดต 2026-10-04 · ตรวจสอบได้จาก E2E (`tests/e2e-respiratory-risk.mjs`) และ unit tests

## ข้อกำหนดและสถานะ (หน้า /respiratory-risk)

| # | ข้อกำหนด | สถานะ | ที่อยู่ |
|---|---|---|---|
| 1 | แสดง RR/HR พร้อมหน่วย (ครั้ง/นาที, bpm) | ✅ | การ์ด 4 ชั้น ชั้นที่ 1 |
| 2 | แสดง Source (แหล่งที่มาของค่า) | ✅ | ชั้นที่ 3 (details) |
| 3 | แสดง Quality Status (Good/Borderline/Insufficient) | ✅ | ชั้นที่ 2 + Quality Gate block |
| 4 | แสดง Algorithm Confidence (แยกจาก accuracy) | ✅ | ชั้นที่ 3 + การ์ด HR |
| 5 | แสดง Timestamp (เวลาที่วัด) | ✅ | ชั้นที่ 3 |
| 6 | แสดง Measurement Duration (ระยะเวลาวัด) | ✅ | ชั้นที่ 3 + summary |
| 7 | แสดง Missing Reason (เหตุผลที่ขาด) | ✅ | การ์ด + coverage (role="status") |
| 8 | แสดงข้อจำกัดต่อสัญญาณ | ✅ | ชั้นที่ 4 (limitations) |
| 9 | แยก Measured กับ Estimated | ✅ | ผ่าน source/algorithm ในชั้น 3 — ค่าทุกตัวระบุว่า "ค่าประมาณจากกล้อง" |
| 10 | แสดง "Research Prototype" | ✅ | "ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก … ใช้เป็นข้อมูลประกอบเท่านั้น" + Prototype ใน disclaimer |
| 11 | แสดง "Not a Diagnosis" | ✅ | "ไม่ใช่การวินิจฉัยทางการแพทย์" (disclaimer ×2, E2E นับ) |
| 12 | แสดง "Clinical Accuracy Not Validated" | ✅ | CLINICAL_ACCURACY_STATUS ทุกสัญญาณ + ชั้นที่ 4 |
| 13 | แสดง "Requires Clinician Review" | ✅ | "ควรพบแพทย์…" + "นำผลนี้ไปปรึกษาแพทย์หรือบุคลากรทางการแพทย์" |
| 14 | SpO2 แสดง "ไม่มีข้อมูล" (ไม่ใช่ 0/Normal) | ✅ | createSpo2LocalMeasurement + E2E |
| 15 | Version/License ไม่ทราบ → แสดง "UNKNOWN — REQUIRES REVIEW" | ✅ (ใหม่ Phase 9) | Data Provenance panel |
| 16 | **Data Provenance panel** (Model/Library, Version, License, Dataset/Training Source, Last Evaluation Date, Metrics Status, Known Limitations) | ✅ (ใหม่ Phase 9) | ส่วนท้ายหน้าผลรวม |

## ข้อความต้องห้ามบนหน้าจอ (ตรวจอัตโนมัติใน E2E)

ห้าม: "ตรวจโรคได้" · "วินิจฉัยได้" · "แม่นยำทางการแพทย์" · "medical-grade" · "clinically accurate" · "ปกติแน่นอน" · "ปลอดภัยแน่นอน" — E2E มี assertion สแกนคำเหล่านี้

## Data Provenance panel (Phase 9) — เนื้อหาที่แสดง

| รายการ | ค่าที่แสดง |
|---|---|
| Model/Library (RR) | MediaPipe Pose Landmarker · version: UNKNOWN — REQUIRES REVIEW (vendored ไม่มี version string) · Apache 2.0 |
| Model/Library (HR) | vitallens 0.6.1 / vitallens-core 0.2.3 · MIT (ตรวจจาก pip) |
| Model/Library (SpO2) | ไม่มี — local POS ไม่ประเมิน SpO2 |
| Dataset/Training Source | ไม่มี — โมเดลพรีเทรน third-party + rule-based (ไม่มีการเทรนใหม่) |
| Last Evaluation Date | ยังไม่มี — ยังไม่ได้ประเมินกับ dataset อ้างอิง |
| Metrics Status | not validated — ไม่มีผลวัดจริง (not-validated) |
| Known Limitations | limitations ต่อสัญญาณ + "ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก" |

หลักการ: ทุกค่า UNKNOWN ต้องแสดงคำว่า "UNKNOWN — REQUIRES REVIEW" ห้ามเดา (ตรวจยืนยันได้จาก MODEL-PROVENANCE.md)
