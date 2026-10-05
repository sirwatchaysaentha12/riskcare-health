# COMPETITION-SUBMISSION-README.md — ภาพรวมสำหรับการส่งแข่งขัน

> อัปเดต 2026-10-04 · ระบบย่อย: **การประเมินความเสี่ยงโรคทางเดินหายใจ (Respiratory Risk Assessment)**

## ระบบนี้คืออะไร

**"ระบบต้นแบบเพื่อประเมินสัญญาณเบื้องต้น ตรวจคุณภาพการวัด และจัดทำข้อมูลประกอบการพิจารณาของบุคลากรทางการแพทย์"**

ระบบต้นแบบที่รวม 3 สัญญาณเข้าด้วยกันด้วยกฎที่เปิดเผยได้ทุกข้อ (rule-based, เกณฑ์อ้างอิง WHO/CDC):
1. **อัตราการหายใจ (RR)** — จากการเคลื่อนไหวไหล่ด้วย MediaPipe Pose (กล้อง)
2. **อัตราการเต้นหัวใจ (HR)** — จากใบหน้าด้วย vitallens POS local (rPPG — ประมวลผลในเครื่อง)
3. **แบบประเมินอาการ** — จากระบบแบบประเมินเดิมของโครงการ

พร้อมคุณสมบัติที่เป็นจุดขายด้านความรับผิดชอบ:
- **Quality Gate 9 ด้าน** — ปฏิเสธให้ค่าเมื่อคุณภาพไม่พอ (ไม่เดาค่า)
- **Data Provenance** — แพทย์ตรวจสอบที่มา/เวอร์ชัน/ไลเซนส์/เวลาของทุกค่าได้
- **Privacy by design** — ไม่เก็บวิดีโอ, ประมวลผลในเครื่อง, consent ก่อนกล้อง
- **Clinician Review Summary** — รายงานพิมพ์ได้สำหรับบุคลากรทางการแพทย์

## ระบบนี้ไม่ใช่อะไร

- ❌ ไม่ใช่เครื่องมือวินิจฉัยโรค · ❌ ไม่ใช่ medical-grade · ❌ ไม่มี Clinical Accuracy ที่ยืนยันแล้ว · ❌ ยังไม่พร้อมใช้กับผู้ป่วยจริง

## Validation ที่ทำจริง (เปิดเผยตรงตามจริง)

Track A — Signal-processing validation บน **BIDMC/PhysioNet** (53 ผู้ป่วย ICU, manual breath annotations):
- MAE **9.03** breaths/min (95% CI 8.49-9.54) · **Bias +8.92** (overcount จาก cardiogenic artifact บนสัญญาณ impedance) · Acceptable Error ±2 = **20.7%** · Abstention **42.4%**
- **ผลนี้เป็น Signal Processing เท่านั้น — ไม่ใช่ Camera Accuracy** (BIDMC ไม่มีวิดีโอ) · **ไม่ใช่ Clinical Validation**
- รายละเอียดครบ: VALIDATION-EVIDENCE-SUMMARY.md · ข้อจำกัด: KNOWN-LIMITATIONS-FOR-JUDGES.md

## ความพร้อม

| ระดับ | สถานะ |
|---|---|
| Demo | ✅ **READY** (mock/synthetic เท่านั้น — COMPETITION-DEMO-SCRIPT.md) |
| Submission | ✅ **READY** (เอกสารครบ ตาม COMPETITION-SUBMISSION-CHECKLIST.md) |
| Clinical Use | ❌ **NO** |
| Real Participant Data | ❌ **NO — REQUIRES PROFESSIONAL REVIEW** |

## แผนที่เอกสาร

| ต้องการรู้อะไร | เปิดไฟล์ |
|---|---|
| ระบบทำอะไร สถาปัตยกรรม | FINAL-PROJECT-REPORT.md |
| ผล validation จริง | VALIDATION-EVIDENCE-SUMMARY.md, TRACK-A-OFFLINE-VALIDATION-REPORT.md |
| ข้อจำกัดที่กรรมการควรรู้ | KNOWN-LIMITATIONS-FOR-JUDGES.md |
| คำถามที่พบบ่อย | JUDGING-FAQ.md |
| สคริปต์สาธิต | COMPETITION-DEMO-SCRIPT.md |
| ข้อกำหนดด้านข้อมูล/จริยธรรม | VALIDATION-PROTOCOL.md, PARTICIPANT-CONSENT-PLAN.md, DATASET-GOVERNANCE-AND-LICENSE-GATE.md |
| โมเดล/ไลเซนส์ที่ใช้ | MODEL-PROVENANCE.md, THIRD-PARTY-NOTICES.md |
| Privacy/Security | PRIVACY-SECURITY-CHECKLIST.md, DATA-RETENTION-AND-DELETION.md |
