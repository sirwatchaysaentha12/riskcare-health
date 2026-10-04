# VALIDATION-PROTOCOL.md — โปรโตคอลตรวจสอบความถูกต้องของการวัด (Measurement Validation)

> สถานะ: **แผนงาน — ยังไม่เริ่มเก็บข้อมูลจริง** · อัปเดต 2026-10-04 (Phase 4)
> ระบบทุกส่วนยังคงสถานะ `clinicalAccuracy = not-validated` จนกว่าโปรโตคอลนี้จะถูกรันจริงและมีผล
> ต้องได้รับความเห็นชอบด้านจริยธรรม (IRB/EC หรือเทียบเท่า) ก่อนเก็บข้อมูลทุกกรณี

## 1. ขอบเขต: แยก Measurement Validation ออกจาก Disease Diagnosis Validation

| | Measurement Validation (Phase นี้ออกแบบ) | Disease Diagnosis Validation (**ไม่อยู่ในขอบเขต**) |
|---|---|---|
| คำถาม | ค่าที่ app วัดได้ (RR/HR) ใกล้เคียงค่าอ้างอิงแค่ไหน | ระบบทำนาย "โรค" ได้ไหม |
| Ground truth | การนับโดยบุคลากร/อุปกรณ์อ้างอิง | การวินิจฉัยโดยแพทย์ |
| สถานะ | ออกแบบ protocol แล้ว รอเก็บข้อมูล | **ไม่ทำ** — ระบบเป็นเครื่องมือคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัย จึงไม่มีโจทย์ "ความแม่นยำวินิจฉัยโรค" |
| ข้อห้ามเกี่ยวข้อง | — | ห้ามอ้าง sensitivity/specificity "ต่อโรค" จากข้อมูลที่ไม่มี diagnosis ground truth |

ระดับ "classification validation" ที่ทำได้จริง: ตรวจว่าการจัดกลุ่มค่า (ปกติ/เฝ้าระวัง/ผิดปกติ ตามเกณฑ์ RR/HR/SpO2) ตรงกับการจัดกลุ่มค่าอ้างอิงด้วยเกณฑ์เดียวกันหรือไม่ (เป็น agreement ของ threshold-based category ไม่ใช่การวินิจฉัยโรค)

## 2. คำถามวิจัย (Research Questions)

- **RQ1 (RR)**: ค่า RR จากกล้อง (MediaPipe) ต่างจากการนับโดยบุคลากรที่ผ่านการฝึกเท่าไร (MAE, Bias, LoA)?
- **RQ2 (HR)**: ค่า HR จาก vitallens POS ต่างจาก ECG/Patient Monitor/Pulse Oximeter เท่าไร?
- **RQ3 (SpO2)**: ไม่มี — local mode วัด SpO2 ไม่ได้ จึงไม่มีคำถาม (ห้ามสร้างค่าเทียบ)
- **RQ4 (Category agreement)**: สัดส่วนที่ app จัดกลุ่มค่าตรงกับการจัดกลุ่มค่าอ้างอิง (confusion matrix ระดับ category)
- **RQ5 (Repeatability)**: วัดซ้ำช่วงห่างคงที่ให้ค่าใกล้กันแค่ไหน (Repeatability Coefficient)?
- **RQ6 (Abstention/Failure)**: Quality Gate ปฏิเสธการวัดถูกต้องแค่ไหนในเงื่อนไขท้าทาย (พูด/ไอ/ขยับ/แสงน้อย)?

## 3. Reference Method (อุปกรณ์/วิธีอ้างอิง)

| สัญญาณ | Reference | ข้อกำหนด |
|---|---|---|
| RR | 1) การนับโดยบุคลากรที่ผ่านการฝึก **2 คนนับพร้อมกัน** โดยไม่เห็นค่า app (ตรวจบลินด์) — ถ้าต่างกัน >2 ครั้ง/นาที นับใหม่ หรือ 2) Patient monitor ที่รายงาน respiration rate | บันทึกผู้นับทั้งสองคน; ค่าอ้างอิง = ค่าเฉลี่ยเมื่อต่างกัน ≤2 |
| HR | ในลำดับความเหมาะสม: ECG → Patient Monitor → Pulse Oximeter ที่แสดง HR และผ่านมาตรฐาน (เช่น ISO 80601) | อุปกรณ์ต้องแสดงค่าตัวเลขต่อเนื่องระหว่างช่วงวัด |
| SpO2 | Pulse Oximeter ที่ตรวจสอบได้ (มีมาตรฐานกำกับ) | ใช้เป็น reference เฉพาะเมื่อระบบมีช่องรับค่าจากอุปกรณ์ภายนอก (ยังไม่มีในปัจจุบัน) — ค่าอุปกรณ์ภายนอกต้อง label ชัดว่ามาจากอุปกรณ์ |

**ห้าม**: ใช้คลิป AI-generated เป็น ground truth · ใช้ค่าที่ผู้ใช้รายงานเองเป็น reference

## 4. การ Sync เวลา กล้อง ↔ Reference

1. อุปกรณ์ทุกตัว (โทรศัพท์/monitor/นาฬิกาอ้างอิง) ตั้งเวลาจากแหล่งเดียวกันก่อนเริ่มเซสชัน
2. ทุกเซสชันบันทึก `syncOffsetMs` (เทียบนาฬิกาอ้างอิงกับนาฬิกาโทรศัพท์ ก่อนและหลังเซสชัน)
3. การวัด app และการนับ/อ่านอุปกรณ์อ้างอิงทำ**พร้อมกันในหน้าต่างเวลาเดียวกัน 30 วินาที** — บุคลากรนับจับเวลาจากสัญญาณเดิมกับปุ่ม "เริ่มวัด"
4. ค่าอุปกรณ์อ้างอิง (HR/SpO2) บันทึกก่อนเริ่มและหลังจบหน้าต่าง 30 วินาที แล้วใช้ค่าเฉลี่ย; ถ้า monitor ให้ค่าเฉลี่ยช่วง (averaged reading) ให้ใช้ค่าช่วงที่ทับซ้อนหน้าต่างวัด ≥80%

## 5. ระยะเวลาวัด และการวัดซ้ำ

- หน้าต่างวัด: **30 วินาที** (ตรงกับระบบจริง)
- จำนวน: **3 ครั้งต่อผู้เข้าร่วมต่อเงื่อนไข** พัก ≥2 นาทีระหว่างครั้ง
- Test-retest: กลับมาวัดซ้ำอีกวัน (ช่วงห่างตามแผน เช่น 24-72 ชม. ±10%) — จำนวนคู่วัดซ้ำบันทึกครบเพื่อ `computeTestRetestRepeatability` (ต้องมี intervalMs ที่สม่ำเสมอ)

## 6. เงื่อนไขการวัด (Conditions)

| Condition | คำอธิบาย | จุดประสงค์ |
|---|---|---|
| resting-normal | นั่งพัก 5 นาที, แสงห้องปกติ (บันทึก lux โดยประมาณ), นิ่ง หายใจปกติ | วัด agreement หลัก (RQ1/RQ2) |
| resting-lowlight | แสงน้อยกว่าปกติ | วัด abstention ของ Quality Gate |
| talking / coughing / moving | วัดระหว่างพูด/ไอจำลอง/ขยับตัว | วัด abstention + failure (คาดหวังว่าระบบต้องปฏิเสธ) |
| reading | นั่งอ่านหนังสือ (หมุนหน้า/ขยับมือ) | เงื่อนไขใกล้ชีวิตจริง |

- **การจัดการไอ/พูด/ขยับ**: ไม่ exclude จากเงื่อนไขท้าทาย — สิ่งที่วัดคือ "ระบบปฏิเสธถูกไหม" (Abstention Rate); ถ้าระบบยังให้ค่าในเงื่อนไขท้าทาย ให้บันทึกค่าไว้วิเคราะห์ error แยก
- **Invalid measurement**: อ้างอิงไม่สมบูรณ์ (นับไม่ตรงกัน >2, device error, ล้มเหลวของอุปกรณ์) → บันทึกพร้อมรหัสเหตุผล แล้ว exclude จาก agreement แต่**ยังนับใน Failure/Excluded report**

## 7. Inclusion / Exclusion Criteria (ร่าง — ต้องผ่าน IRB ก่อนใช้จริง)

**Inclusion**: อายุ ≥18 ปี · ยินยอมเป็นลายลักษณ์อักษร · นั่งนิ่งได้ ≥5 นาที · พูด/อ่านภาษาไทยหรือมีผู้แปล
**Exclusion**: ไม่ยินยอม · สภาพที่ monitor อ้างอิงใช้ไม่ได้ตามคู่มืออุปกรณ์ (เช่น จ่ายเลือดมือข้างวัดผิดปกติชัดเจนตามที่ผู้ให้บริการดูแลระบุ) · ปัจจัยที่คู่มืออุปกรณ์อ้างอิงระบุว่าใช้วัดไม่ได้
**ห้าม** exclude ด้วยเกณฑ์ที่จะทำให้ sample ไม่สะท้อนกลุ่มผู้ใช้จริง เช่น สีผิว/เพศ โดยไม่มีเหตุผลทางเทคนิคที่บันทึกไว้

## 8. Bias และ Subgroup Analysis

- บันทึกข้อมูลกลุ่ม (ไม่ระบุตัวตน): ช่วงอายุ, เพศ, สีผิวระดับ Fitzpatrick I-VI, ช่วง BMI, เสื้อผ้า (แน่น/หลวม), ระดับแสง (lux)
- รายงานเมตริกหลัก (MAE/Bias) **แยกต่อ subgroup** — หาก subgroup ใด n <10 ระบุว่า insufficient
- ตรวจ bias: ถ้า MAE ต่างกัน >50% ระหว่าง subgroup → รายงานเป็นความเสี่ยงด้านความเป็นธรรม (fairness) อย่างชัดเจน

## 9. Dataset Split และ Leakage Prevention

- **แบ่งตามบุคคล ไม่ใช่ตามเฟรม/เรคคอร์ด**: train/validation/test = 60/20/20 ของ "คน"
- ใช้ `splitByParticipant()` + `assertNoParticipantLeakage()` จาก `frontend/src/utils/validationMetrics.js` (unit test ครอบคลุม: คนเดียวกันหลายเรคคอร์ดใน split เดียว OK, ข้าม split = throw)
- การพัฒนาอัลกอริทึมใด ๆ ห้ามปรับ threshold จาก test set (test set เปิดใช้ครั้งเดียวตอนรายงาน)

## 10. Metrics Framework และกฎการรายงาน

โค้ด: `frontend/src/utils/validationMetrics.js` (14 unit tests) — ครอบคลุม:
- **Agreement**: MAE, RMSE, Mean Bias (+95% bootstrap CI), Median AE, Bland-Altman mean bias ± LoA (1.96·SD), Acceptable Error %
- **Operation**: Failure Rate, Abstention Rate, Test-Retest Repeatability Coefficient (1.96·√2·Sw)
- **Classification** (category agreement): Confusion Matrix, Sensitivity, Specificity, PPV, NPV; ROC-AUC/Brier **เฉพาะเมื่อมี probability ที่มีความหมาย** (คะแนน rule-based ของระบบไม่ใช่ probability → โดยดีฟอลต์ไม่คำนวณ)

กฎบังคับของทุกรายงานผล:
1. ระบุ n ที่ใช้จริง / missing / excluded / failed / abstained (ฟังก์ชันคืนค่าครบอยู่แล้ว)
2. แนบ 95% CI เมื่อ n ≥2 (bootstrap)
3. n <30 → ติดป้าย **"Exploratory/Unstable Estimate"** อัตโนมัติ
4. **ห้าม**คำนวณเมื่อไม่มี reference (ฟังก์ชันคืน computed:false) · **ห้าม**ตัวเลขสมมติ · **ห้าม**ใช้ correlation เป็น accuracy (ไม่มี field correlation ในผลลัพธ์โดยตั้งใจ)
5. ระบุ Dataset, Reference Standard, Threshold (acceptableError), เงื่อนไข (condition) ในทุกตารางผล

## 11. สิ่งที่ Protocol นี้พิสูจน์ไม่ได้

- ความแม่นยำในการ "วินิจฉัยโรค" ใด ๆ (ไม่มี diagnosis ground truth และไม่มีโจทย์)
- ความแม่นยำของ SpO2 ในโหมด local (ไม่มีค่าให้เทียบ — ต้องใช้ Pulse Oximeter ภายนอก)
- ประสิทธิภาพในกลุ่มผู้ป่วยจริง (protocol นี้เป็นกลุ่มสุขภาพดี/อาสาสมัครทั่วไป)
- ผลใด ๆ จนกว่าจะเก็บข้อมูลจริงตาม protocol นี้ — จนถึงวันนั้นทุกค่ายังเป็น `not-validated`
