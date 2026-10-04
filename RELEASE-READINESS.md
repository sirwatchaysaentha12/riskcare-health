# RELEASE-READINESS.md — ระดับความพร้อมของระบบประเมินความเสี่ยงทางเดินหายใจ

> อัปเดต 2026-10-04 (Phase 6) · ผลทดสอบอ้างอิง: ERROR-MATRIX.md · ผลรวม Phase 1-6

## ระดับความพร้อม 3 ระดับ

| ระดับ | สถานะ | เงื่อนไข |
|---|---|---|
| **1. Demo Ready** | ✅ **YES** | ดู DEMO-RUNBOOK.md — ใช้ mock/synthetic ข้อมูลเท่านั้น, fallback ครบ, ไม่เก็บข้อมูลใด, แสดง disclaimer ทุกจุด |
| **2. Internal Pilot Ready** | ⚠️ **CONDITIONAL** | ใช้ภายในทีมพัฒนากับอาสาสมัครสมัครใจได้ **เฉพาะเมื่อ**: มี consent ฉบับสมบูรณ์ + ผู้รับผิดชอบจริยธรรมอนุมัติ verbal + ไม่เก็บข้อมูลนอกเครื่อง · **ยังขาด**: consent audit log ถาวร, IRB, ผลตรวจจากอาสาสมัครจริง |
| **3. Real Participant Ready** | ❌ **NO — REQUIRES PROFESSIONAL REVIEW** | **"ยังไม่ควรเริ่มเก็บข้อมูลอาสาสมัครจริง — REQUIRES PROFESSIONAL REVIEW"** — ต้องมี IRB/EC, consent ฉบับลงนาม, audit log, และผล validation ตาม VALIDATION-PROTOCOL.md ก่อน |

## สิ่งที่ผ่านแล้ว (หลักฐาน)

| ด้าน | สถานะ | หลักฐาน |
|---|---|---|
| คุณภาพการวัด (Quality Gate) | ✅ | Phase 2 — 9 การตรวจ block ค่าไม่ผ่าน (unit 20/20, E2E) |
| Metadata/Provenance | ✅ | Phase 3 — contract 13 field, MODEL-PROVENANCE.md, Clinician Summary |
| Validation Framework | ✅ (โครงสร้าง) | Phase 4 — metrics + protocol + leakage prevention (ยังไม่มีข้อมูลจริง = ยังไม่มีตัวเลข) |
| Privacy/Security | ✅ เชิงเทคนิค | Phase 5 — consent 2 ชั้น, MIME/size/duration/decode, redaction, temp cleanup (security 9/9) |
| Error handling | ✅ | Phase 6 — ERROR-MATRIX 15 PASS / 2 NOT RUN ที่มีเหตุผล |
| SpO2 | ✅ Missing ตลอด | local POS ให้เฉพาะ HR — ไม่มีค่าจำลองทุกเส้นทาง |
| RR formula / Quality threshold / Risk score | ✅ ไม่ถูกแก้ | เทียบ baseline ตั้งแต่ Phase 2 |

## ช่องว่างก่อนขึ้นระดับ 3 (Real Participant)

1. IRB/EC approval + consent ฉบับลงนาม
2. Consent audit log แบบถาวร (ปัจจุบันเป็น console/event ชั่วคราว)
3. ผล validation จริงตาม protocol (RR vs การนับ, HR vs ECG/monitor)
4. Manual upload ที่ยังไม่ผูก research consent แยก (ปิดจนกว่าจะมี flow ชัด)
5. การทดสอบ timeout route-level 150s จริง

## ข้อจำกัดที่ประกาศตรงไปตรงมา

- ทุกค่า `clinicalAccuracy = not-validated` — ห้ามอ้างความแม่นยำทางคลินิกในสไลด์/โปสเตอร์/demo
- HR จาก rPPG และ RR จากไหล่เป็น "ค่าประมาณจากกล้อง" เท่านั้น
- เวอร์ชัน MediaPipe tasks-vision vendored = UNKNOWN (ดู MODEL-PROVENANCE.md)
