# BIDMC-EVALUATION-SPEC.md — กติกาการประเมิน (ประกาศก่อนดูผล Test)

> Phase 13 · ประกาศ 2026-10-04 **ก่อน**การคำนวณ metrics ใด ๆ — เพื่อกันการ "เปลี่ยน threshold หลังเห็นผล"

## 1. หน่วยวิเคราะห์ (Evaluation Window)

- หน้าต่าง **30 วินาที ไม่ทับซ้อน (non-overlapping)** จาก channel **RESP (impedance respiration)** @125 Hz ของแต่ละ record
- Record ยาว 8 นาที → สูงสุด **16 หน้าต่าง/record × 53 records = 848 หน้าต่าง** (หน้าต่างที่ signal สั้น/ขาดจะถูก QC กรอง)
- หนึ่ง record = หนึ่ง participant (BIDMC 1 record ต่อคน)

## 2. Algorithm ที่ประเมิน (Track A — Signal Processing Only)

- `computeBreathingRate(samples)` จาก `frontend/src/utils/breathingRate.js` — **ฟังก์ชันเดิมของ production ไม่แก้พารามิเตอร์ใด** (default: minGapMs=1500, prominenceFactor=0.5)
- Input: samples {t (ms), y (RESP ค่า raw)} ของหน้าต่าง
- Output: {bpm, peaks, spanMs, periodicity} — bpm = null เมื่อ periodicity/CV gate ไม่ผ่าน → นับเป็น **abstention** (ไม่ใช่ 0)
- หมายเหตุที่ต้องประกาศ: algorithm นี้ถูกออกแบบกับสัญญาณไหล่ — Track A ทดสอบว่า "กลไก peak counting เดียวกัน" ทำงานกับ impedance respiration ได้ดีแค่ไหน = **Signal Processing Validation เท่านั้น** ห้ามอ้างเป็น Camera Accuracy

## 3. Reference (บังคับระบุแหล่ง — คำนวณก่อนรัน algorithm)

- **Primary Reference**: manual breath annotations (`bidmc_##_Breaths.csv` — sample index @125 Hz จาก 2 annotators) → **reference RR ของหน้าต่าง = จำนวน breath ในหน้าต่าง × 2**
  - annotator 1 เป็น primary; annotator 2 ใช้ตรวจความสอดคล้องของ annotation (ถ้านับหน้าต่างเดียวกันต่าง >2 breath → flag หน้าต่างนั้น)
- **Secondary Reference**: numerics RR จาก impedance (`bidmc_##_Numerics.csv` คอลัมน์ RESP @1 Hz) → ค่า median ของหน้าต่าง (รายงานแยก — ไม่รวมกับ primary)

## 4. เกณฑ์ยอมรับ (ประกาศล่วงหน้า)

- **Acceptable Error: ±2 ครั้ง/นาที** (รายงาน Acceptable Error Rate ที่ ±2)
- Reference ของหน้าต่างถือ invalid เมื่อ: จำนวน breath ในหน้าต่างน้อยกว่า 3 (RR < 6 — นอกช่วงสรีระที่ protocol สนใจ), annotation หาย, หรือ signal ขาด >10% ของหน้าต่าง → exclude + นับใน excluded report

## 5. Split (ตาม Participant — ประกาศก่อนรัน)

- แบ่ง 53 records → train/validation/test = 60/20/20 **ตาม record (= ตามคน)** seed=2026, ใช้ `splitByParticipant` + `assertNoParticipantLeakage`
- เนื่องจาก Phase นี้**ไม่มีการ train และไม่มีการปรับ threshold** → รายงานผลรวมทุกหน้าต่าง (All) เป็นผลหลัก + แยก per-split เป็นการยืนยันความสม่ำเสมอ
- ห้ามใช้ผลของ split ใดไปปรับพารามิเตอร์ algorithm

## 6. Metrics ที่จะรายงาน (ผ่าน `computeAgreementMetrics` เท่านั้น)

N participant · N window · MAE · RMSE · Mean Bias (+95% CI) · Median AE · Bland-Altman + LoA · Acceptable Error Rate (±2) · **Failure Rate** (algorithm error) · **Abstention Rate** (gate ปฏิเสธ) · Coverage (สัดส่วนหน้าต่างที่ gate ปล่อยผ่าน) — แยก per-split + ทั้งชุด · Subgroup: ราย record

## 7. ข้อห้าม

- ห้ามเปลี่ยน minGapMs/prominenceFactor/gate หลังเห็นผล
- ห้ามใช้ correlaion แทน accuracy · ห้ามสรุป clinical accuracy จากผลนี้ · ห้ามรวมกับ metrics จาก track อื่น
- หาก algorithm ไม่สามารถรันกับ impedance signal ได้อย่างมีความหมาย (QC เผยให้เห็น) → รายงาน `NOT COMPARABLE — BIDMC HAS NO RGB VIDEO INPUT` + `NOT AVAILABLE — NO VALIDATED RUN` อย่างตรงไปตรงมา
