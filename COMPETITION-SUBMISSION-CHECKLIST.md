# COMPETITION-SUBMISSION-CHECKLIST.md — เช็คลิสต์ก่อนส่ง

## A. เอกสาร (9 ฉบับ)

- [x] COMPETITION-SUBMISSION-README.md — ภาพรวม + แผนที่เอกสาร
- [x] PROJECT-ABSTRACT-TH.md
- [x] PROJECT-ABSTRACT-EN.md
- [x] JUDGING-FAQ.md — 9 คำถามจากหลักฐานจริง
- [x] VALIDATION-EVIDENCE-SUMMARY.md — ตัวเลข BIDMC ตรงตามรันจริง
- [x] KNOWN-LIMITATIONS-FOR-JUDGES.md — รวมผลลบที่ไม่ซ่อน
- [x] COMPETITION-DEMO-SCRIPT.md — 13 จุด + fallback
- [x] COMPETITION-SUBMISSION-CHECKLIST.md (ฉบับนี้)
- [x] COMPETITION-READINESS-REPORT.md — สถานะสุดท้าย

## B. เอกสารสนับสนุน (อ้างอิงได้)

- [x] FINAL-PROJECT-REPORT.md · FINAL-RELEASE-GATE-REPORT.md
- [x] VALIDATION-PROTOCOL.md · MODEL-EVALUATION-PLAN.md · MODEL-TRAINING-PLAN.md
- [x] TRACK-A-OFFLINE-VALIDATION-REPORT.md · BIDMC-QC-REPORT.md · BIDMC-EVALUATION-SPEC.md · BIDMC-SPLIT-MANIFEST.md
- [x] PRIVACY-SECURITY-CHECKLIST.md · DATA-RETENTION-AND-DELETION.md · CONSENT-IMPLEMENTATION-NOTES.md
- [x] MODEL-PROVENANCE.md · THIRD-PARTY-NOTICES.md
- [x] DATASET-GOVERNANCE-AND-LICENSE-GATE.md · EXTERNAL-DATASET-REVIEW.md

## C. ข้อความต้องมี / ห้ามมี

- [x] มี: "ระบบต้นแบบเพื่อประเมินสัญญาณเบื้องต้น ตรวจคุณภาพการวัด และจัดทำข้อมูลประกอบการพิจารณาของบุคลากรทางการแพทย์"
- [x] มี: ไม่ใช่การวินิจฉัย · ยังไม่ผ่านการยืนยันทางคลินิก · ข้อจำกัดครบ · ผลลบเปิดเผย (bias/MAE/abstention)
- [x] ไม่มี: "ตรวจโรคได้ / วินิจฉัยได้ / medical-grade / clinical accuracy / diagnostic tool / พร้อมใช้ผู้ป่วยจริง" (E2E สแกนคำ)
- [x] ไม่มี: SpO2 = 0/Normal · Quality Insufficient = Low Risk · Pseudonymous เรียกว่า Anonymous

## D. Demo (วันจริง)

- [ ] dev server 2 ตัวพร้อม + ล็อกอินผ่าน (รหัสจาก env — ไม่อยู่ในเอกสาร)
- [ ] ผ่าน COMPETITION-DEMO-SCRIPT.md ครบ 13 จุดซ้อม 1 รอบ
- [ ] สำรอง: คลิปสังเคราะห์ + สกรีนช็อต + แผน fallback 3 แบบ
- [ ] ตรวจว่าไม่มีข้อมูลอาสาสมัครจริง/วิดีโอจริงในเครื่องสาธิตที่จะเปิดให้ชม

## E. ความปลอดภัยก่อนส่ง

- [x] git grep secret/password scan — สะอาด (เหลือ test-account password ใน test scripts เท่านั้น — ดู COMPETITION-READINESS-REPORT.md §ข้อสังเกต)
- [x] ไม่มี .env/raw video/face image/dataset จริง ใน commit
- [x] ไม่มีข้อมูลอาสาสมัครจริง

## F. สถานะสุดท้าย

- [x] Demo Ready = **YES**
- [x] Submission Ready = **YES**
- [x] Clinical Use = **NO**
- [x] Real Participant Data = **NO**
- [x] Professional Review = **REQUIRED — ยังไม่ดำเนินการ**
