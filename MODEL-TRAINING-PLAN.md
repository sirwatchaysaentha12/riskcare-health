# MODEL-TRAINING-PLAN.md — แผนการฝึกโมเดล (ยังไม่ดำเนินการ)

> Phase 9 · สถานะ: **แผนงาน — ห้าม Train/เปลี่ยน Production Model จนกว่าจะผ่านเงื่อนไข "ก่อน Train" ด้านล่าง** · อัปเดต 2026-10-04

## เงื่อนไขก่อนเริ่ม Train (Prerequisite Gate)

1. ✅ License Gate ผ่านอย่างน้อย 1 dataset ที่มี reference ตรงสัญญาณ (ปัจจุบัน: BIDMC + MIMIC-III WDB สำหรับ RR/HR — ดู EXTERNAL-DATASET-REVIEW.md)
2. ⬜ Signed agreement/สิทธิ์ใช้จริงของ dataset ที่เลือก (ถ้าต้องมี)
3. ⬜ Training Plan + Evaluation Plan ผ่านการรีวิวโดยผู้เชี่ยวชาญ
4. ⬜ ยืนยันว่าการ train ไม่ขัด license (เช่น share-alike ของ ODbL)
5. ⬜ งบเวลา/เครื่อง (GPU) พร้อม

**ปัจจุบัน: ยังไม่ผ่านข้อ 2-5 → ห้ามเริ่ม train**

## 1. สัญญาณเป้าหมายและงาน

| งาน | Input | Target | หมายเหตุ |
|---|---|---|---|
| T1: RR estimation | วิดีโอใบหน้า/ไหล่ (หรือสัญญาณ y-ไหล่) | RR (ครั้ง/นาที) | dataset ที่มี respiration reference |
| T2: HR estimation | วิดีโอใบหน้า (rPPG) | HR (bpm) | dataset ที่มี ECG/PPG reference |

## 2. เปรียบเทียบกับ Baseline บังคับ (ตามโจทย์)

โมเดลใหม่ต้องชนะทั้ง 3 ชั้นนี้บน **same split (ตามบุคคล)** จึงจะพิจารณา:

| ชั้น | Baseline | คำอธิบาย |
|---|---|---|
| B1 | **Persistence/Naive** | ทำนาย RR/HR = ค่าก่อนหน้าหรือค่าเฉลี่ยหน้าต่างก่อนหน้า (ไม่ใช้ input ใหม่) |
| B2 | **Existing Rule / Moving Average** | การนับ peak + moving average ของสัญญาณ (สูตรเดิมของ `breathingRate.js` — ไม่แก้ ใช้ประเมินเท่านั้น) |
| B3 | **Current Camera Pipeline** | pipeline จริงปัจจุบัน (MediaPipe shoulders + POS) รวม Quality Gate — ค่าที่ production ให้วันนี้ |
| B4 | **Candidate Model ใหม่** | เฉพาะโมเดลที่ train จาก dataset ที่ผ่าน License Gate เท่านั้น |

ห้ามนำ B4 ขึ้น production เว้นแต่: ชนะ B1-B3 บน test split, ผ่านรอบรีวิว, และมีผล cross-dataset ไม่ต่างจากใน-dataset มากเกินเกณฑ์ที่ประกาศล่วงหน้า

## 3. ลำดับการทำงาน (เมื่อผ่าน Gate)

1. โหลด dataset ผ่าน License Gate → เก็บนอก repo (ตาม DATASET-GOVERNANCE)
2. แปลงเป็น `external_windows` ตาม EXTERNAL-DATA-SCHEMA.md (หน้าต่าง 30 วิ ให้ตรงกับระบบจริง)
3. Split ตาม participant 60/20/20 (seed บันทึก) → `assertNoParticipantLeakage`
4. รัน B1-B3 ให้ค่าผลบน validation ก่อน (ยังไม่แตะ test)
5. Train candidate บน train split only; ปรับ hyperparameter ด้วย validation only
6. Calibration/threshold tuning ใช้ validation เท่านั้น — **ห้ามแตะ test**
7. รัน test หนึ่งครั้ง → รายงานผลตาม MODEL-EVALUATION-PLAN.md
8. ทำซ้ำข้าม dataset (BIDMC → MIMIC-III WDB) เพื่อวัด domain shift

## 4. ข้อจำกัดที่ต้องระบุล่วงหน้า

- Dataset ที่ CLEARED เป็นประชากร ICU (BIDMC/MIMIC) — ต่างจากผู้ใช้แอปทั่วไปมาก → ผลอาจไม่ย้ายไปใช้จริง (domain shift บังคับวิเคราะห์)
- ห้ามใช้คลิป AI-generated / ข้อมูลสังเคราะห์เป็น ground truth ในการ train หรือประเมิน
- Quality Gate และ Risk Score ของระบบปัจจุบัน **ไม่ถูกแก้** — candidate model เป็นเพียงชั้นทดแทน "การประมาณค่า" ในอนาคต ต้องผ่านรอบรีวิวแยก
- ทุกผลที่ได้ = ผลบน dataset ภายนอก ไม่ใช่ clinical validation (ยังต้องมี protocol กับอาสาสมัครจริง)
