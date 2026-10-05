# DATASET-RESEARCH-QUESTIONS.md — คำถามวิจัยสำหรับการใช้ Dataset ภายนอก

> Phase 9 · สถานะ: **แผนงาน — ยังไม่มีการ Train หรือเปลี่ยน Production Model** · อ้างอิง VALIDATION-PROTOCOL.md

## บริบท

ระบบปัจจุบันเป็น rule-based (RR จากการเคลื่อนไหวไหล่ + gate, HR จาก vitallens POS) ที่ **ยังไม่ผ่านการยืนยันทางคลินิก** — Dataset ภายนอกมีไว้เพื่อ "ประเมินและพัฒนาอย่างมีหลักฐาน" เท่านั้น ไม่ใช่เพื่ออ้างความแม่นยำ

## คำถามวิจัย

### RQ-D1 (RR — คุณภาพของค่าที่มีอยู่)
ค่า RR จาก camera pipeline ปัจจุบันต่างจาก RR อ้างอิงใน dataset ที่มี respiration reference แค่ไหน (MAE/Bias/LoA) เมื่อรันผ่าน Quality Gate จริง?

### RQ-D2 (HR — คุณภาพของ vitallens POS)
ค่า HR จาก vitallens POS ต่างจาก ECG/PPG reference ใน rPPG datasets แค่ไหน และ confidence สัมพันธ์กับ error จริงหรือไม่ (calibration)?

### RQ-D3 (Quality Gate — Abstention)
เมื่อป้อน dataset ที่มีเงื่อนไขท้าทาย (motion/lighting) Quality Gate ปฏิเสธถูกต้องแค่ไหน — Abstention Rate ต่ำพอที่จะใช้งานได้จริงหรือไม่?

### RQ-D4 (Candidate Model — เฉพาะหลัง License Gate)
โมเดลเฉพาะทาง (เช่น deep rPPG ที่ train บน dataset ที่ผ่าน license) ให้ MAE ดีกว่า POS baseline อย่างมีนัยสำคัญหรือไม่ — วัดแบบ same-split by participant?

### RQ-D5 (Domain Shift)
ผลจาก dataset หนึ่ง (เช่น ผู้ป่วย ICU จาก BIDMC) ย้ายไปใช้กับอีก dataset (webcam บ้านจาก COHFACE) ได้ดีแค่ไหน — **ห้ามสรุปจาก dataset เดียวว่าใช้ได้กับทุกคน**?

### RQ-D6 (Subgroup/Fairness)
Error ต่างกันตาม สีผิว/เพศ/อายุ/BMI หรือไม่ — datasets ที่มีข้อมูลกลุ่ม (COHFACE มี lighting/skin-tone challenge design) ใช้ตอบได้เท่าไร?

## สิ่งที่ dataset ภายนอก**ไม่สามารถ**ตอบได้

- ความแม่นยำเทียบ "อาการจริงของผู้ใช้แอป" (ต้องใช้ protocol กับอาสาสมัครตาม VALIDATION-PROTOCOL.md)
- ความถูกต้องเชิงการวินิจฉัยโรค (นอกขอบเขตระบบ)
- ประสบการณ์จริงของผู้ใช้ (คุณภาพกล้องมือถือ/แสงบ้าน) — ใช้ได้บางส่วนจาก COHFACE เท่านั้น

## เกณฑ์ความสำเร็จของการวิจัยชุดนี้ (ก่อนพิจารณา train จริง)

1. License Gate ผ่านอย่างน้อย 1 dataset ที่มี RR reference (ดู EXTERNAL-DATASET-REVIEW.md)
2. มีคำยินยอม/สิทธิ์ใช้จริง (signed agreement ถ้าต้องมี)
3. Training/Evaluation Plan ได้รับการรีวิวจากผู้เชี่ยวชาญ
4. Metrics ทั้งหมดวัดจริงก่อนอ้างอิงเสมอ
