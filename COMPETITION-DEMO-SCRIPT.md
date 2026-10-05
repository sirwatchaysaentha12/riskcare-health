# COMPETITION-DEMO-SCRIPT.md — สคริปต์สาธิตในการแข่งขัน (Mock/Synthetic เท่านั้น)

> รวบรวมจาก DEMO-RUNBOOK.md + DEMO-CHECKLIST.md — ครบ 13 จุดที่โจทย์กำหนด
> **ข้อความนิยามที่ใช้ตลอด**: "ระบบต้นแบบเพื่อประเมินสัญญาณเบื้องต้น ตรวจคุณภาพการวัด และจัดทำข้อมูลประกอบการพิจารณาของบุคลากรทางการแพทย์"

## การเตรียม (T-15 นาที)

1. `cd admin-app && npm run dev` (:3000) + `cd frontend && npm run dev` (:5173)
2. ล็อกอินด้วยบัญชีทดสอบ (รหัสจาก env `DEMO_TEST_PASSWORD` — **ไม่เขียนในเอกสาร**)
3. ตรวจ webcam + คลิปสังเคราะห์สำรองใน `tmp-vitallens/` + สกรีนช็อตสำรอง
4. ตรวจ: `/respiratory-risk` → consent แสดง + ปุ่มวัด disabled + อัปโหลด locked

## สคริปต์ (ตรงกับ 13 จุดที่โจทย์กำหนด)

### 1-2. Consent + Privacy Notice
แสดง consent screen 7 ประเด็น (กล้องเพื่ออะไร / 30 วิ / MediaPipe ในเครื่อง / คลิปไป backend localhost / raw video ไม่เก็บ / ไม่ใช่การวินิจฉัย / ยกเลิกได้) → ชี้ว่าก่อนยินยอม **กล้องล็อก + อัปโหลดล็อก** → ติ๊ก (research ไม่ pre-check)

### 3. Quality Good
วัดจริง 30 วิ ในที่แสงดี → Quality Gate แสดง **Good** (9 ช่องผ่าน)

### 4. RR/HR พร้อมหน่วย + Source + Quality
การ์ด RR (ครั้ง/นาที) + HR (bpm) — ชั้นที่ 3 แสดง Source (MediaPipe/vitallens ในเครื่อง), Algorithm Confidence ("ไม่ใช่ความแม่นยำทางคลินิก"), เวลา+ระยะเวลาวัด

### 5. SpO2 = Missing
การ์ด SpO2 แสดง **"ไม่มีข้อมูล"** — บอกเหตุผล (local POS ไม่ประเมิน — ยืนยันจากซอร์ส) และย้ำ "ระบบไม่สร้างค่าทดแทน"

### 6-7. Quality Insufficient → ไม่เข้า Risk Scoring
สาธิตทางเลือก: วัดขณะขยับ/เสียบคลิปไม่มีใบหน้า → Gate แดง **Insufficient — ค่าการวัดไม่ถูกใช้** + การ์ด RR = "ไม่มีข้อมูล" + retryGuidance → ผลรวมคิดจากสัญญาณที่ผ่านเท่านั้น (coverage ระบุ "สัญญาณที่ขาดไป")

### 8-9. Clinician Summary + Print/Export
Clinician Review Summary — ตาราง 7 คอลัมน์ + Pseudonymous ID + กด **"พิมพ์รายงาน"** (print view เฉพาะรายงาน ไม่มีวิดีโอ/ตัวตน)

### 10. Data Provenance
เปิด "Data Provenance & Model Status" — ตาราง โมเดล/เวอร์ชัน/ไลเซนส์ (MediaPipe UNKNOWN—REQUIRES REVIEW, vitallens 0.6.1 MIT) + Dataset/Training Source ไม่มี + Last Evaluation

### 11. Validation Summary
อ้าง BIDMC Track A (รายงานตรงตามจริง): "signal-only validation บน BIDMC 53 คน — **MAE 9.03, Bias +8.92, ยังไม่ผ่านการใช้งานจริง** — เป็นฐานหลักฐาน ไม่ใช่ camera accuracy"

### 12. Limitations
ชั้นที่ 4 ของการ์ด + KNOWN-LIMITATIONS-FOR-JUDGES.md — SpO2 missing, ICU population, generalization/fairness ยังพิสูจน์ไม่ได้

### 13. Fallback (เลือกสาธิต 1-2 อย่าง)
- **กล้องไม่พร้อม/ปฏิเสธสิทธิ์** → แจ้งเหตุผล + ประเมินจากแบบประเมินอาการเดิมได้เต็มรูปแบบ
- **โมเดลโหลดไม่ได้** → RR missing แต่ HR จากคลิปยังทำงาน
- **Backend ปิด** → soft failure + ใช้สัญญาณที่เหลือ

## ปิดท้าย (ข้อความบังคับ)

- "ระบบต้นแบบเพื่อประเมินสัญญาณเบื้องต้น ตรวจคุณภาพการวัด และจัดทำข้อมูลประกอบการพิจารณาของบุคลากรทางการแพทย์"
- "ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก — ไม่มีการอ้าง clinical accuracy และไม่ใช่เครื่องมือวินิจฉัย"
- หากกรรมการถามเลข validation → เปิด VALIDATION-EVIDENCE-SUMMARY.md + JUDGING-FAQ.md ตอบจากหลักฐาน

## ห้าม
ห้ามให้ผู้ชมวัดโดยไม่ผ่าน consent · ห้ามใช้คลิปใบหน้าจริง · ห้ามพูด "ตรวจโรคได้/วินิจฉัยได้/medical-grade/พร้อมใช้กับผู้ป่วยจริง" · ห้ามเก็บข้อมูลผู้ชม
