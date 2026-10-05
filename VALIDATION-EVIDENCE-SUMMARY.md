# VALIDATION-EVIDENCE-SUMMARY.md — สรุปหลักฐาน Validation (ตัวเลขตรงตามการรันจริง 2026-10-04)

> แหล่งผลดิบ: `C:\Users\ACER\research-data\bidmc\validation-results.json` (นอก Git) · สคริปต์: `scripts/bidmc-qc-validate.mjs` · กติกา: BIDMC-EVALUATION-SPEC.md (ประกาศก่อนเห็นผล)

## สรุปสถานะ

| รายการ | ค่า |
|---|---|
| Dataset | BIDMC PPG and Respiration v1.0.0 (PhysioNet, DOI 10.13026/C2208R, **ODC-By 1.0**) |
| Track | **A — Signal Processing Only** (BIDMC ไม่มี RGB Video → ไม่ใช่ Camera Accuracy) |
| Modality | Impedance Respiration / PPG / ECG @125 Hz |
| Algorithm ที่ประเมิน | `computeBreathingRate` (production default parameters — ไม่แก้) |
| Split | ตาม participant 32/11/10 (train/validation/test, seed 2026) — leakage check ผ่าน |
| QC | **10/10 PASS** (BIDMC-QC-REPORT.md) |

## Metrics จริง — Primary Reference (manual breath annotations)

| Metric | ค่า |
|---|---|
| Participants | **53** |
| Windows สร้าง | **842** (30 วิ non-overlapping) |
| Windows ใช้จริง | **484** |
| **MAE** | **9.03 ครั้ง/นาที** (95% CI 8.49–9.54) |
| **RMSE** | **10.74** |
| **Mean Bias** | **+8.92 ครั้ง/นาที** (95% CI 8.37–9.44) |
| Median Absolute Error | **10** |
| Bland-Altman LoA | −2.84 … +20.67 |
| **Acceptable Error ±2** | **20.7%** |
| **Failure Rate** | **0.1%** |
| **Abstention Rate** | **42.4%** (357/842 — Quality Gate ปฏิเสธ) |
| Coverage | 57.5% |

## การตรวจสอบความน่าเชื่อถือของผล

- **Secondary reference** (numerics RR จาก monitor — อิสระจาก manual count): MAE 8.98, Bias +8.83 (n=473) → สอง reference ให้ bias ตรงกัน
- **Per-split MAE**: train 8.77 / validation 10.69 / test 8.02 → bias สม่ำเสมอทุก split (ไม่ใช่ความบังเอิญของชุดใด)
- ผลดิบครบทุกหน้าต่างเก็บใน JSON นอก repo

## การตีความ (ตรงไปตรงมา)

- **พบ overcount ~+9 breaths/min อย่างเป็นระบบ** — สอดคล้องกับ cardiogenic artifact บนสัญญาณ impedance (คลื่นหัวใจ ~1 ครั้ง/จังหวะหายใจ ถูกนับรวม)
- **Quality Gate abstention 42.4%** — gate ปฏิเสธหน้าต่างที่สัญญาณไม่เป็นคาบ (พฤติกรรมถูกต้องตามการออกแบบ "ไม่เดาค่า")
- **ไม่มีการ train/tune ใด** — ทุกตัวเลขคือ algorithm พารามิเตอร์ default

## ข้อจำกัดของหลักฐานนี้

- ประชากร ICU — ไม่สะท้อนผู้ใช้แอปทั่วไป
- **ไม่ใช่ Camera Accuracy** (ไม่มีวิดีโอ) · **ไม่ใช่ Clinical Validation**
- ห้ามรวมผลนี้กับ metrics ของ track/dataset อื่นเป็นค่าเดียว
