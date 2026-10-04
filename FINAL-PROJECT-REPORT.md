# FINAL-PROJECT-REPORT.md — รายงานฉบับสมบูรณ์ ระบบประเมินความเสี่ยงโรคทางเดินหายใจ 3 สัญญาณ

> วันที่: 2026-10-04 · Phase 1-7 ครบ · สถานะโครงการ: **Prototype — ข้อมูลประกอบการพิจารณา**
> นิยามอย่างเป็นทางการของระบบ: **"ระบบต้นแบบสำหรับประเมินสัญญาณเบื้องต้นและช่วยจัดข้อมูลประกอบการพิจารณา"**

---

## 1. Executive Summary

พัฒนา "ระบบต้นแบบสำหรับประเมินสัญญาณเบื้องต้นและช่วยจัดข้อมูลประกอบการพิจารณา" ที่รวม 3 สัญญาณ (อัตราการหายใจจากกล้อง, ชีพจรจาก rPPG, แบบประเมินอาการ) ด้วย rule-based weighted scoring ตามเกณฑ์อ้างอิง WHO/CDC — พร้อม Quality Gate ที่**ปฏิเสธให้ค่าเมื่อคุณภาพไม่พอ**, Measurement Contract ที่ทำให้แพทย์ตรวจสอบที่มาของทุกค่าได้, Consent/Privacy/Security ที่ผ่านการทดสอบ และชุดทดสอบครบ (E2E 40/40, security 9/9, timeout-cleanup 2/2, regression 131 เคส)

**สถานะ**: Demo Ready ✅ · Internal Pilot = CONDITIONAL · **Real Participant = NO — "ยังไม่ควรเริ่มเก็บข้อมูลอาสาสมัครจริง — REQUIRES PROFESSIONAL REVIEW"**

## 2. Problem and Motivation

โรคระบบทางเดินหายใจมักแสดงสัญญาณเตือนผ่าน vital signs พื้นฐาน (อัตราการหายใจ, ชีพจร, SpO2) แต่การวัดต้องใช้อุปกรณ์/บุคลากร ผู้ใช้ทั่วไปที่อยู่ในพื้นที่ฝุ่น PM2.5 สูงจึงไม่มีเครื่องมือคัดกรองเบื้องต้น — ระบบนี้ใช้กล้องที่มีอยู่แล้ว (webcam/มือถือ) ประเมินสัญญาณเบื้องต้น **เพื่อช่วยจัดข้อมูลให้แพทย์พิจารณา ไม่ใช่ทดแทนการวินิจฉัย**

## 3. System Architecture

```
[Browser]
 Consent Screen (3 checkbox, research ไม่ pre-check)
   → RrCameraCapture: getUserMedia + MediaPipe PoseLandmarker (offline local)
      → RR: shoulder-y sampling 30s → computeBreathingRate (peak+periodicity+CV gate)
      → Quality Accumulator → buildQualityResult (9 checks)
      → MediaRecorder → blob
   → Manual Upload (ผูก consent เช่นกัน)
   → Supabase: ผลแบบประเมินอาการเดิม (risk_assessments)
        │
[vite proxy] /api/vital-signs
        │
[admin-app :3000 Next.js route]
 magic-byte MIME check → 60MB limit (Content-Length guard) → server-generated temp name
   → spawn python (arg array) → vital_signs_runner.py
      → ffprobe duration ≤90s → ffmpeg VFR→CFR normalize (decode validation)
      → vitallens 0.6.1 POS local (ไม่มี API key, ไม่ติดต่อเน็ต) → HR + confidence
   → ลบ temp ใน finally ทุกกรณี · redactError() ทุก response
        │
[Scoring] respiratoryRiskScore.ts (เกณฑ์ WHO/CDC + เกณฑ์เดิมของแบบประเมิน)
   → measurementContract.js (13-field metadata/สัญญาณ)
   → Clinician Review Summary (printable, Pseudonymous ID)
```

## 4. Signal Inventory

| สัญญาณ | แหล่ง | สถานะการใช้งาน | สถานะการพิสูจน์ |
|---|---|---|---|
| **RR** | MediaPipe Pose (ไหล่) + peak/periodicity/CV gate | **ใช้ได้เมื่อ Quality Gate ผ่าน** (คุณภาพไม่พอ = ไม่มีค่า ไม่ใช่ค่าต่ำ) | **ยังไม่ Clinical Validated** — รอเทียบการนับโดยบุคลากร |
| **HR** | VitalLens 0.6.1 POS local (rPPG ใบหน้า) | ให้ค่า + Algorithm Confidence | Confidence **ไม่ใช่ Clinical Accuracy** — ยังไม่เทียบ ECG/monitor |
| **SpO2** | ไม่มี — **Local POS mode ไม่มีข้อมูล SpO2** (`supported_vitals=["heart_rate"]`) | **Missing ตลอด** — ระบบไม่สร้างค่าทดแทน; ใช้ Pulse Oximeter ภายนอกหากมี | n/a |
| **Questionnaire** | แบบประเมินอาการเดิม (14 ข้อ, เกณฑ์ 5/10/16 + red flag) | **ใช้ประกอบการประเมิน ไม่ใช่การวินิจฉัย** | เป็นการรายงานอาการโดยผู้ใช้เอง |

## 5. Quality Gate (Phase 2)

9 การตรวจ: duration ≥90% · ไหล่ในเฟรม ≥70% · แสง (เกณฑ์ 38-225) · เบลอ (edgeDetail ≥4) · FPS ≥7 · dropped ≤35% · motion (≤36) · periodicity ≥0.35 · interval CV ≤0.6 — **ค่าที่ insufficient ไม่เข้า scoring แสดงเป็น "ไม่มีข้อมูล" + missingReason + retryGuidance** (Good/Borderline/Insufficient แสดงเป็นข้อความ สีไม่ใช่ตัวบ่งชี้เดียว)

## 6. Measurement Contract (Phase 3)

ทุกสัญญาณมี metadata 13 field: value/unit/usable/source/measuredAt/durationSeconds/qualityStatus/qualityReasons/algorithmConfidence/clinicalAccuracy (**fix = not-validated**)/missingReason/algorithm+version/limitations · กฎเหล็ก: unusable → value=null (ห้าม 0) · confidence ≠ accuracy · Clinician Review Summary พิมพ์ได้ ใช้ Pseudonymous ID (ไม่เรียก Anonymous) ไม่รวมวิดีโอ

## 7. Privacy and Security (Phase 5)

Consent ก่อนกล้องและก่อนอัปโหลด · raw video ไม่มี storage ถาวร (temp ลบใน finally ทุกกรณี) · MIME จาก magic bytes + server-generated filename + 60MB + 90s + decode validation · arg-array spawn (ไม่มี shell string) · error redaction (ไม่เผย path/stack/key) · log ไม่มีข้อมูลสุขภาพ · ไม่มี key ฝังใน repo · รายละเอียด: PRIVACY-SECURITY-CHECKLIST.md, DATA-RETENTION-AND-DELETION.md, CONSENT-IMPLEMENTATION-NOTES.md

## 8. Validation Protocol (Phase 4)

ออกแบบครบใน VALIDATION-PROTOCOL.md (RR=2 observers blind / HR=ECG→monitor→pulse ox / sync offsetMs / 30s×3+retest / conditions incl. พูด-ไอ-ขยับ / split ตามบุคคล + leakage check) พร้อม metrics framework ทดสอบครบ (validationMetrics.js) — **ยังไม่มีข้อมูลจริง จึงไม่มีตัวเลข metrics ใด ๆ ในรายงานนี้** (ตามข้อห้าม "ห้ามสร้าง Metrics ปลอม")

## 9. Test Evidence (ตัวเลขจากการรันจริง 4 ต.ค. 2026)

| ชุดทดสอบ | ผล |
|---|---|
| E2E (Playwright + fake camera) | **40/40 PASS** |
| Security (HTTP จริงต่อ backend) | **9/9 PASS** |
| Timeout cleanup (kill จริง ~4s, env config) | **2/2 PASS** |
| Regression 15 suites (unit/integration) | **131 เคส PASS** ได้แก่ respiratoryRiskScore 15 · signalQuality 20 · measurementContract 16 · validationMetrics 14 · breathingRate 7+5 · cameraQuality 8 · riskQuestionnaire 4 · respiratorySignal 5 · pm25Personalization 10 · provinces 4 · airQualityDashboard 7 · provinceNotification 5 · security 9 · timeout 2 |
| Build | PASS |
| Lint (ไฟล์ที่แก้/ใหม่) | 0 error |
| Error Matrix 16 กรณี | PASS 15 · NOT RUN 2 ย่อย (ดู §10) |

**แยกให้ชัดเจน 4 ระดับ:**
- **สิ่งที่ระบบทำได้จริง (ยืนยันใน production code path)**: วัด HR จากใบหน้า, ประมาณ RR จากไหล่พร้อม quality gate, รวมคะแนนตามกฎ, รายงาน metadata ครบ, fallback ทุกเส้นทาง
- **สิ่งที่ทดสอบด้วย Mock/Synthetic Data เท่านั้น**: ทั้งหมดของ E2E (กล้องเสมอนจากคลิปสังเคราะห์), security tests, timeout test — **ไม่เคยใช้เป็น ground truth ทางสรีรวิทยา**
- **สิ่งที่ยังไม่ได้พิสูจน์**: ความถูกต้องของ RR/HR เทียบอุปกรณ์อ้างอิง, generalization, fairness ข้ามกลุ่ม, repeatability จริง
- **สิ่งที่ต้องให้ผู้เชี่ยวชาญ/IRB ตรวจ**: consent ฉบับลงนาม, audit log ถาวร, การเก็บข้อมูลตาม protocol, ผล validation ก่อนอ้างอิงเชิงคลินิกใด ๆ

## 10. Error Matrix (รายละเอียดเต็มใน ERROR-MATRIX.md)

**16 กรณี: PASS 15 · NOT RUN 2 รายการย่อย** — (1) Device Busy จำลองจริงบน Windows ไม่ได้ (ใช้ catch path เดียวกับ Permission Denied ที่ PASS) (2) Route-level timeout 150s เต็มเวลา (kill logic ยืนยันแล้วที่ lib-level ด้วย env config — production timeout ไม่ถูกลด)

## 11. Demo Readiness

**Demo Ready = YES** — ตาม DEMO-RUNBOOK.md + DEMO-CHECKLIST.md (mock/synthetic เท่านั้น, fallback กล้อง/โมเดล/backend ครบ) · Internal Pilot = CONDITIONAL · Real Participant = NO

## 12. Limitations (ประกาศตรงไปตรงมา)

1. ไม่มี Clinical Validation — ทุกค่า `not-validated`
2. ไม่มี Reference Dataset จริง
3. SpO2 ไม่มีข้อมูลจาก Local Mode (POS = HR เท่านั้น)
4. tasks-vision version UNKNOWN (vendored ไม่มี version string)
5. Device Busy test ยัง NOT RUN
6. Route-level 150s timeout เต็มเวลายัง NOT RUN
7. Consent Audit Event ยังเป็น Console/CustomEvent ชั่วคราว (ไม่ใช่ audit store ถาวร)
8. ยังไม่ทดสอบอาสาสมัครจริง
9. Generalization ยังพิสูจน์ไม่ได้
10. Fairness ยังพิสูจน์ไม่ได้ (รอ subgroup data ตาม protocol)

## 13. Required Next Steps (ก่อนขึ้นระดับ Real Participant)

1. IRB/EC พิจารณา + consent ฉบับลงนาม (PARTICIPANT-CONSENT-PLAN.md)
2. Consent audit store ถาวร
3. เก็บข้อมูลตาม VALIDATION-PROTOCOL.md → คำนวณ metrics จริงด้วย validationMetrics.js
4. เทียบ RR/HR กับ reference method + subgroup/fairness analysis
5. พิจารณาเพิ่มช่องรับค่า SpO2 จาก Pulse Oximeter ภายนอก (label ที่มาอุปกรณ์ชัดเจน)
6. บันทึกเวอร์ชันจริงของ tasks-vision vendored (ปิดช่อง UNKNOWN)

---

*ระบบนี้ไม่ใช่เครื่องมือวินิจฉัย ไม่ใช่ medical device และไม่มีการอ้างความแม่นยำทางการแพทย์ใด ๆ — เอกสารนี้ไม่มี API key/token/.env*
