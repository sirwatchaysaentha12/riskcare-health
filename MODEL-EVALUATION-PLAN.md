# MODEL-EVALUATION-PLAN.md — แผนการประเมินผล (แผนก่อนวัด — ยังไม่มีตัวเลข)

> Phase 9 · อัปเดต 2026-10-04 · ใช้เครื่องมือจริงที่มีอยู่: `validationMetrics.js` (unit-tested) + `EXTERNAL-DATA-SCHEMA.md`

## 1. หลักการรายงาน (บังคับทุกผล)

1. คำนวณผ่าน `computeAgreementMetrics()` / `computeClassificationMetrics()` เท่านั้น — บังคับรายงาน n/nUsed/nMissing/nFailed/nAbstained
2. **ห้ามใส่ตัวเลข Metrics ก่อนรันจริง** — ทุกตารางในเอกสารนี้เป็น "นิยาม" ไม่ใช่ "ผล"
3. รายงาน 95% CI (bootstrap ในเครื่องมือ) เมื่อ n ≥ 2
4. n < 30 → ระบบจะติดป้าย Exploratory/Unstable Estimate อัตโนมัติ
5. **ห้ามใช้ Correlation เป็น accuracy** · ห้ามรายงาน accuracy ตัวเดียว
6. ระบุทุกครั้ง: dataset, pipeline version, split counts ตามบุคคล, เงื่อนไข

## 2. Metrics สำหรับ RR/HR (Agreement กับ Reference)

| Metric | นิยาม | เงื่อนไขใช้ |
|---|---|---|
| MAE | ค่าเฉลี่ย \|measured − reference\| | หลัก |
| RMSE | รากค่าเฉลี่ยกำลังสองของ error | หลัก (จับ outlier) |
| Mean Bias | mean(measured − reference) ± 95% CI | หลัก |
| Median Absolute Error | median(\|error\|) | กัน outlier |
| Bland-Altman + LoA | mean bias ± 1.96·SD (repeated-measurement LoA เมื่อมีการวัดซ้ำ) | เมื่อเหมาะสม (สัญญาณต่อเนื่อง) |
| Acceptable Error % | % หน้าต่างที่ error ≤ เกณฑ์ (RR ±2, HR ±5 — ประกาศล่วงหน้าก่อนเห็นผล) | รายงานคู่กับ MAE |
| Failure Rate | สัดส่วนคำขอที่ pipeline ล้มเหลว | บังคับ |
| Abstention Rate | สัดส่วนที่ Quality Gate ปฏิเสธ | บังคับ — สำคัญเท่า MAE |
| Quality Gate Coverage | สัดส่วนหน้าต่างที่ gate ให้ผ่าน (good+acceptable) | ใหม่ใน Phase 9 |

## 3. Metrics สำหรับการจัดกลุ่ม (Category Agreement)

- จัดกลุ่มค่า measured และ reference ด้วย**เกณฑ์เดียวกัน** (RR 12-20/21-24/>24; HR 60-100) → Confusion Matrix / Sensitivity / Specificity / PPV / NPV
- ROC-AUC/Brier: **ไม่คำนวณโดยดีฟอลต์** — rule-based score ของระบบไม่ใช่ probability (ใช้ได้เฉพาะเมื่อมี calibrated probability ที่มีความหมาย)

## 4. Subgroup Analysis

- แยกผลตาม: เพศ, ช่วงอายุ, สีผิว (ถ้า dataset มี), เงื่อนไข (static/motion/talking/dark), environment (ICU vs webcam)
- subgroup n < 10 → รายงาน "insufficient"
- ต่าง >50% ระหว่าง subgroup → รายงานเป็นความเสี่ยง fairness

## 5. Test-Retest / Repeatability

- เฉพาะ dataset ที่มีการวัดซ้ำช่วงห่างคงที่ → `computeTestRetestRepeatability()` (interval ไม่สม่ำเสมอ ±10% = not computable)

## 6. Domain Shift

- Train/val บน dataset A → วัด test บน dataset B (เช่น BIDMC → MIMIC-III WDB, หรือ ICU → webcam dataset ถ้าผ่าน license)
- รายงานการเสื่อมสภาพ (degradation) เทียบ in-dataset — **ห้ามสรุป generalization จาก dataset เดียว**

## 7. เกณฑ์ "ผ่าน" ที่ประกาศล่วงหน้า (ก่อนเห็นผล — ตัวเลขเหล่านี้เป็นเกณฑ์การตัดสิน ไม่ใช่ผลวัด)

- Candidate model ต้องมี MAE ต่ำกว่า B1-B3 ทั้งหมดบน test split พร้อม CI ไม่ซ้อน
- Failure + Abstention รวม ≤ 30% บนเงื่อนไข resting
- ผ่าน leakage check (`assertNoParticipantLeakage`) และ split counts รายงานครบ

**เอกสารนี้ยังไม่มีผลวัดใด ๆ ทั้งสิ้น — ผลจริงจะบันทึกใน `evaluation_runs` ตาม EXTERNAL-DATA-SCHEMA.md เมื่อรัน**
