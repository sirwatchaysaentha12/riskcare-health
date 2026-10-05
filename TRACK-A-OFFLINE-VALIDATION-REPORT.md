# TRACK-A-OFFLINE-VALIDATION-REPORT.md — ผล Offline Validation จริง (BIDMC × Signal Processing)

> รันจริง 2026-10-04 · สคริปต์: `scripts/bidmc-qc-validate.mjs` · กติกาประกาศล่วงหน้าใน BIDMC-EVALUATION-SPEC.md (ก่อนเห็นผล)
> **Track: A — Signal Processing Only** · ข้อมูลจริงทุกตัวเลข · ผลดิบ: `C:\Users\ACER\research-data\bidmc\validation-results.json` (นอก Git)

## ⚠️ ขอบเขตของรายงานนี้ (อ่านก่อนทุกข้อ)

- นี่คือ **Signal-processing validation** — ทดสอบกลไก peak counting (`computeBreathingRate` พารามิเตอร์ default เดิมของ production) กับสัญญาณ **impedance respiration** ของ BIDMC
- **ไม่ใช่ Camera Accuracy** (BIDMC ไม่มีวิดีโอ) · **ไม่ใช่ Clinical Accuracy** · **ไม่ใช่ End-to-end Validation**
- BIDMC เป็นประชากรผู้ป่วย ICU — ผลไม่สะท้อนผู้ใช้แอปทั่วไป (domain shift)

## 1. ข้อมูลที่ใช้

| รายการ | ค่า |
|---|---|
| Dataset | BIDMC PPG and Respiration v1.0.0 (PhysioNet, ODC-By 1.0) |
| Participants | 53 (1 record × 8 นาที ต่อคน) |
| Signal input ของ algorithm | RESP (impedance respiration) @125 Hz |
| Reference (primary) | manual breath annotations (annotator 1) — จำนวน breath ในหน้าต่าง × 2 |
| หน้าต่าง | 30 วินาที non-overlapping → **842 หน้าต่าง** (16/record × 53 ลบหน้าต่างท้ายที่ไม่เต็ม) |
| Split | ตาม participant 32/11/10 (train/validation/test, seed 2026) — leakage check ผ่าน |

## 2. Metrics จริง — Primary Reference (manual breath annotations)

| Metric | ค่า (วัดจริง) |
|---|---|
| N windows | 842 (ใช้จริง 484 — ที่เหลือ abstained) |
| **MAE** | **9.03 ครั้ง/นาที** (95% CI 8.49-9.54) |
| **RMSE** | 10.74 |
| **Mean Bias** | **+8.92 ครั้ง/นาที** (95% CI 8.37-9.44) — algorithm **นับมากกว่าคนจริงอย่างเป็นระบบ** |
| Median Absolute Error | 10 |
| Bland-Altman LoA | −2.84 … +20.67 (กว้างมาก) |
| Acceptable Error Rate (±2) | **20.7%** |
| Failure Rate | 0.1% (1/842 — bpm นอกช่วง 6-40) |
| **Abstention Rate** | **42.4%** (357/842 — periodicity/CV gate ปฏิเสธ) |
| Coverage (ผ่าน gate) | 57.5% |

### แยกตาม split (MAE — แสดงความสม่ำเสมอของ bias)

| Split | MAE | n |
|---|---|---|
| train (32 คน) | 8.77 | — |
| validation (11 คน) | 10.69 | — |
| test (10 คน) | 8.02 | — |

consistent ทุก split → bias ไม่ใช่ความบังเอิญของชุดใดชุดหนึ่ง

## 3. Metrics จริง — Secondary Reference (numerics RR จาก monitor)

MAE 8.98 · Mean Bias +8.83 (n = 473) — **สอง reference อิสระกัน (manual count กับ monitor-derived) ให้ bias ตรงกัน** → ยืนยันว่า overcounting มาจาก algorithm บนสัญญาณ impedance จริง

## 4. การตีความที่ซื่อสัตย์ (ผลลบที่ต้องรายงานตรง)

1. **Algorithm นับ peak มากเกินจริงอย่างเป็นระบบ (+8.9 bpm)** — ที่ bias ≈ +9 บน reference ~15 bpm สอดคล้องกับลักษณะ impedance respiration ที่มี **cardiogenic artifact** (คลื่นจากการเต้นหัวใจซ้อนในคลื่นหายใจ ~1 peak/จังหวะหายใจ)
2. **Peak counting แบบเดียวกับที่ใช้กับไหล่ ไม่สามารถใช้กับ impedance respiration โดยไม่ปรับ** — นี่คือผลที่มีค่า: ยืนยันว่า "transfer พารามิเตอร์ข้าม modality โดยไม่ตรวจ" ไม่ได้
3. **Quality Gate ทำงานถูกทิศทาง** — ปฏิเสธ 42% ของหน้าต่าง (สัญญาณ impedance ไม่เป็นคาบแบบที่ gate คาด) แต่ 57% ที่ผ่านยังให้ค่า bias สูง → gate ช่วยลดไม่ได้ช่วยกำจัด bias
4. **Acceptable Error Rate เพียง 20.7%** — ต่ำกว่าเกณฑ์ใช้งานจริงอย่างชัดเจน

## 5. ข้อจำกัดของการประเมินนี้

- ประชากร ICU (ผู้ป่วยวิกฤต) — ไม่สะท้อนผู้ใช้ทั่วไป
- หน้าต่าง 30 วิ กับสัญญาณ 125 Hz เป็นขนาดที่ periodicity/CV gate ยังไม่เคยถูกออกแบบมาสำหรับโดยตรง
- ไม่ได้ประเมิน camera pipeline ครบวงจร (BIDMC ไม่มีวิดีโอ — ดู Phase 11/12)
- ไม่มีการ train/tune ใด — ตัวเลขทั้งหมดคือ algorithm พารามิเตอร์ default

## 6. สิ่งที่ห้ามสรุปจากรายงานนี้

- ❌ ห้ามสรุปว่า "ระบบกล้องแม่นยำ/ไม่แม่นยำ" — BIDMC ไม่มีวิดีโอ
- ❌ ห้ามสรุป clinical accuracy ใด ๆ
- ❌ ห้ามใช้ตัวเลขนี้ร่วมกับ metrics ของ track/dataset อื่นเป็นค่าเดียว

## 7. สิ่งที่บันทึกไว้ต่อยอด

- ผลดิบ (842 หน้าต่าง + QC + per-record): `C:\Users\ACER\research-data\bidmc\validation-results.json`
- ข้อเสนองานถัดไป (ต้องมี approval/protocol แยก — **ห้ามทำอัตโนมัติ**): ประมวลผล artifact ก่อนนับ peak (เช่น bandpass ที่ช่วง RR 0.13-0.8 Hz) ใน **research branch** แล้วรันซ้ำด้วย protocol เดียวกันเทียบกับ baseline นี้
