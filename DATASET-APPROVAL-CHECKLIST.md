# DATASET-APPROVAL-CHECKLIST.md — เช็คลิสต์ขออนุมัติและขั้นตอนหลังอนุมัติ

> Phase 10 · 2026-10-04 · ใช้คู่กับ DATASET-APPROVAL-PACKET.md · สถานะปัจจุบัน: **BLOCKED — WAITING FOR DATASET/LICENSE/PROFESSIONAL APPROVAL**

## ส่วนที่ 1 — Checklist ขออนุมัติ (ผู้ใช้/ผู้ดูแลโครงการติ๊ก)

### A. เลือก Dataset และขอบเขต
- [ ] อนุมัติ **BIDMC** (ODC-By, open) สำหรับ offline validation ของ RR — แนะนำ
- [ ] อนุมัติ **MIMIC-III Waveform** (ODbL, share-alike) สำหรับ training pool
- [ ] อนุมัติ **VitalDB** แบบ RESEARCH ONLY (ไม่ใช้ในผลงานแข่งขัน)
- [ ] อนุมัติ **COHFACE** แบบ RESEARCH ONLY (หลังยื่น EULA ได้รับอนุมัติจาก Idiap)
- [ ] (ไม่อนุมัติ PURE/WESAD/CapnoBase/UBFC-rPPG ในรอบนี้ — NOT CLEARED)

### B. ขอบเขตการใช้งานที่อนุมัติ
- [ ] ใช้เพื่อ Offline Validation เท่านั้น (ไม่ train production model)
- [ ] ห้ามใช้ผลที่ได้เป็น clinical claim
- [ ] ยืนยันสิทธิ์ competition use ของ dataset ที่เลือก (BIDMC/MIMIC = ได้; VitalDB/COHFACE = ห้าม)
- [ ] ยืนยัน attribution/citation ตาม DATASET-GOVERNANCE-AND-LICENSE-GATE.md ข้อ 4

### C. โครงสร้างรองรับ
- [ ] Storage นอก Git พร้อม (path + สิทธิ์เข้าถึงจำกัด)
- [ ] Deletion plan ระบุแล้ว (ลบเมื่อเลิกใช้/เมื่อ license กำหนด)
- [ ] Professional review (จริยธรรม/เทคนิค) ยืนยันแล้ว ← **บังคับก่อนดาวน์โหลด**
- [ ] ผู้รับผิดชอบข้อมูล (data steward) ระบุชื่อ

## ส่วนที่ 2 — Checklist หลังได้รับอนุมัติ (ก่อนรัน metrics)

### D. Download & Manifest
- [ ] ดาวน์โหลดจาก official URL เท่านั้น (ตรวจ URL ซ้ำว่าตรงกับ PACKET)
- [ ] บันทึก manifest: ชื่อไฟล์, ขนาด, **SHA-256 checksum**, วันที่ดาวน์โหลด, license ณ วันนั้น
- [ ] ยืนยัน checksum ตรงกับที่ PhysioNet/ต้นทางประกาศ (ถ้ามี)
- [ ] **ไม่มีไฟล์ dataset เข้า Git** (ตรวจ `git status` หลังดาวน์โหลด)

### E. QC (ก่อนใช้หน้าต่างใด ๆ)
- [ ] Duplicate detection (record/segment ซ้ำ)
- [ ] Missing data audit (signal ขาด/สั้นกว่า 30 วิ)
- [ ] Unit check (RR ครั้ง/นาที, HR bpm, SpO2 %)
- [ ] Timestamp/alignment audit (BIDMC: impedance vs annotation offset; MIMIC: jitter ≤500ms)
- [ ] Reference quality flags (สัญญาณอ้างอิงเสีย → exclude + นับใน excluded report)

### F. Leakage Prevention
- [ ] Split **ตาม participant** (60/20/20, seed บันทึก)
- [ ] `assertNoParticipantLeakage()` ผ่าน
- [ ] หน้าต่างจากคนเดียวกันไม่ข้าม split (แม้เวลาต่างกัน)
- [ ] **ห้าม**สุ่มแบ่งตาม frame/window ข้ามคน
- [ ] Threshold/calibration ปรับด้วย validation เท่านั้น

### G. การประเมินตามลำดับ (รายงานทีละชั้น)
- [ ] 1) Persistence/Naive baseline
- [ ] 2) Rule/Moving Average (สูตรเดิม `breathingRate.js` — ประเมินเท่านั้น)
- [ ] 3) Current Camera Pipeline (รวม Quality Gate — abstention บันทึกจริง)
- [ ] 4) Candidate model — **เฉพาะเมื่อได้รับอนุมัติแยก**

### H. การรายงานผล
- [ ] คำนวณผ่าน `computeAgreementMetrics()` เท่านั้น (N/nUsed/nExcluded/Failure/Abstention ครบ)
- [ ] 95% CI แนบ + exploratory flag (n<30)
- [ ] Subgroup results (ถ้า dataset มี metadata)
- [ ] ทุกช่องที่ไม่ได้รัน = **NOT AVAILABLE — NO VALIDATED RUN**
- [ ] ตรวจว่าไม่มี PII/วิดีโอดิบหลุดเข้ารายงาน/repo

## ส่วนที่ 3 — สิ่งที่ห้ามทำเสมอ (จากข้อห้ามของ Phase)

- ❌ ดาวน์โหลดก่อนอนุมัติ · ❌ train ก่อนอนุมัติ · ❌ เปลี่ยน production model/threshold
- ❌ ใช้ test set ปรับ threshold · ❌ commit dataset เข้า Git · ❌ แตะ OpenAQ/Vertex
- ❌ สุ่มแบ่งตาม frame · ❌ ใช้คลิปใบหน้าจริง/AI clip เป็น ground truth · ❌ อ้าง clinical accuracy

## สถานะปัจจุบัน

**BLOCKED — WAITING FOR DATASET/LICENSE/PROFESSIONAL APPROVAL**
(ยังไม่ Download และยังไม่ Train — Metrics ทุกช่อง: NOT AVAILABLE — NO VALIDATED RUN)
