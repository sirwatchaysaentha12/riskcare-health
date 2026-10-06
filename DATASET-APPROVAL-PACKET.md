# DATASET-APPROVAL-PACKET.md — ชุดเอกสารขออนุมัติ Dataset สำหรับ Offline Validation

> Phase 10 · จัดทำ 2026-10-04 · **สถานะรวม: PENDING — DO NOT DOWNLOAD OR TRAIN**
> ตัวต่อไปของ EXTERNAL-DATASET-REVIEW.md (Phase 9) — เอกสารนี้จัดทำเพื่อ**ขออนุมัติจากผู้ใช้/ผู้เชี่ยวชาญ**ก่อนดาวน์โหลดและวัดจริง
> สถานะราย dataset ณ วันที่ตรวจ license ล่าสุด (2026-10-04) — ต้องตรวจซ้ำจาก official source ก่อนดาวน์โหลดจริงทุกครั้ง

## ⚠️ คำเตือน Modality Mismatch — อ่านก่อนอนุมัติ (เพิ่ม 2026-10-04 Phase 11)

**BIDMC ไม่มีวิดีโอ RGB เลย** — สัญญาณที่มีคือ PPG + impedance respiration + ECG (waveform 125 Hz เท่านั้น)
ขณะที่ camera pipeline ของระบบต้องการ **วิดีโอ** เป็น input (MediaPipe บนเฟรมวิดีโอ / vitallens บนวิดีโอใบหน้า)

→ ดังนั้น **BIDMC รันผ่าน camera pipeline จริงไม่ได้** = `NOT COMPARABLE — DATA MODALITY MISMATCH`
หากอนุมัติ BIDMC ต้องกำหนดให้ชัดก่อนว่าจะวัดอะไร เช่น:
1. ตรวจ "อัลกอริทึมนับ peak ของสัญญาณ respiration" (`breathingRate.js` นิยามเดิม) กับสัญญาณ impedance/annotation — เป็นการ validate **ส่วนประมวลผลสัญญาณ** ไม่ใช่กล้อง
2. หรือเลือก dataset ที่มีวิดีโอจริง (COHFACE — webcam บ้าน, research-only) สำหรับ validate กล้องครบวงจร

ผู้อนุมัติต้องเลือกข้อ 1 หรือ 2 (หรือทั้งคู่) พร้อมยอมรับข้อจำกัดของแต่ละทาง ก่อนขั้นตอนดาวน์โหลดจะเริ่มได้


## สรุปผู้บริหารสำหรับผู้อนุมัติ

| Dataset | จุดประยุกต์ (Purpose) | License | Competition use | สถานะ Gate |
|---|---|---|---|---|
| **BIDMC PPG and Respiration** | หลัก — RR validation (มี manual breath annotations) | ODC-By 1.0 (open) | ได้ (attribution) | Gate ผ่าน 11/13 — ขาด: professional review, สิทธิ์สำรองสำเนา → **PENDING** |
| **MIMIC-III Waveform** | รอง — RR/HR training pool ขนาดใหญ่ (QC หนัก) | ODbL 1.0 (open, share-alike) | ได้ (attribution + share-alike) | Gate ผ่าน 11/13 — ขาดเช่นเดียวกัน + QC alignment ≤500ms → **PENDING** |
| **VitalDB** | สำรอง — RR จาก capnography คุณภาพสูง | CC BY-NC-SA 4.0 + DUA | **ไม่ได้** | **PENDING — RESEARCH ONLY — DO NOT USE FOR COMPETITION OR PRODUCTION WITHOUT EXPLICIT APPROVAL** |
| **COHFACE** | สำรอง — domain shift/subgroup (webcam บ้าน) | non-commercial EULA | **ไม่ได้** | **PENDING — RESEARCH ONLY — DO NOT USE FOR COMPETITION OR PRODUCTION WITHOUT EXPLICIT APPROVAL** |
| PURE | (อ้างอิงประวัติศาสตร์ rPPG) | ต้องเซ็น agreement — ยืนยันไม่ได้ | ไม่ชัด | **NOT CLEARED FOR USE** |
| WESAD | (respiration chest reference สำรอง) | ambiguous บนหน้า UCI | ไม่ชัด | **NOT CLEARED FOR USE** |
| CapnoBase | (RR จาก capnometry) | ตรวจไม่ได้ (เว็บล้ม) | ไม่ชัด | **NOT CLEARED FOR USE** |
| UBFC-rPPG | (HR rPPG benchmark) | ตรวจไม่ได้ (login-wall) | ไม่ชัด | **NOT CLEARED FOR USE** |

**คำแนะนำขออนุมัติ (แนวทางที่คุ้มค่าที่สุด)**: อนุมัติ **BIDMC เพียงชุดเดียว** สำหรับ Offline Validation รอบแรก (open license, เล็กพอ 53×8 นาที, มี manual breath annotations ที่ไม่มีใครเทียบ) — จำกัดขอบเขตเพื่อลดภาระ IRB/สิทธิ์ · MIMIC-III WDB ขออนุมัติตามหลังเมื่อต้องการ training pool · VitalDB/COHFACE อนุมัติแบบ RESEARCH ONLY หากต้องการ domain-shift วิจัยภายใน

---

## รายละเอียดราย dataset (ตามฟิลด์ที่โจทย์กำหนด)

### 1. BIDMC PPG and Respiration — **PENDING — DO NOT DOWNLOAD OR TRAIN**
- **Official URL**: https://physionet.org/content/bidmc/1.0.0/ · **Version**: 1.0.0 (2018-06-20, DOI 10.13026/C2208R)
- **License**: Open Data Commons Attribution License v1.0 (ODC-By)
- **Access/DUA**: เปิดกว้าง ไม่ต้อง credentialing/DUA
- **Participant/Recording**: 53 ผู้ป่วย ICU × 8 นาที
- **RR/HR Reference**: RR = manual breath annotations (2 annotators อิสระ) + impedance; HR = ECG; SpO2 มี
- **Sampling Rate**: waveform 125 Hz; numerics 1 Hz
- **ข้อจำกัด**: ประชากร ICU (domain shift กับผู้ใช้จริง), 53 คนไม่ใหญ่, annotation ผูกกับคุณภาพ impedance
- **Research Scope**: ✅ ได้ · **Competition Scope**: ✅ ได้ (attribution) · **Commercial Scope**: ✅ โดยหลัก ODC-By (ยืนยัน license file ก่อนเผยแพร่เชิงพาณิชย์)
- **เหมาะกับ Train/Validation**: ✅ Validation หลัก (RR); Train ได้แต่เล็ก
- **เงื่อนไขที่ยังต้องยืนยัน**: Professional review, storage plan, checksum หลังดาวน์โหลด, deletion plan
- **วันที่ตรวจสอบ license**: 2026-10-04

### 2. MIMIC-III Waveform Database — **PENDING — DO NOT DOWNLOAD OR TRAIN**
- **Official URL**: https://physionet.org/content/mimic3wdb/1.0/ · **Version**: 1.0 (2020-04-07, DOI 10.13026/c2607m)
- **License**: ODbL v1.0 (⚠️ share-alike — derivative database ต้องใช้ ODbL)
- **Access/DUA**: เปิดกว้าง (waveform); matched clinical data ต้องขอแยก
- **Participant/Recording**: 67,830 record sets / ~30,000 ICU patients
- **RR/HR Reference**: numerics RR/HR/SpO2 (monitor-derived)
- **Sampling Rate**: waveform 125 Hz; numerics 1 Hz
- **ข้อจำกัด**: inter-waveform alignment คลาดเคลื่อน ≤500ms (กระทบ rPPG), signal ขาดได้, ICU population
- **Research Scope**: ✅ · **Competition Scope**: ✅ (share-alike) · **Commercial Scope**: ✅ โดยหลัก ODbL
- **เหมาะกับ Train/Validation**: ✅ Training pool (หลัง QC); Validation ได้
- **เงื่อนไขที่ยังต้องยืนยัน**: QC ขนาดใหญ่, share-alike ผลกระทบกับผลงาน, professional review, storage (ขนาดใหญ่)
- **วันที่ตรวจสอบ license**: 2026-10-04

### 3. VitalDB — **PENDING — RESEARCH ONLY — DO NOT USE FOR COMPETITION OR PRODUCTION WITHOUT EXPLICIT APPROVAL**
- **Official URL**: https://vitaldb.net/dataset/ · **Version**: open dataset (Sci Data 2022;9:279)
- **License**: CC BY-NC-SA 4.0 + Data Use Agreement
- **Access/DUA**: ฟรี + ยอมรับ DUA (ใช้วิจัย/พัฒนาเท่านั้น, รายงาน misuse 24 ชม.)
- **Participant/Recording**: 6,388 surgical cases
- **RR/HR Reference**: RR จาก capnography (CO2 62.5Hz) — คุณภาพสูง; HR/SpO2 จาก monitor
- **Sampling Rate**: 500 Hz (ECG/PPG), 62.5 Hz (CO2)
- **ข้อจำกัด**: single center, non-cardiac surgery, **NonCommercial**
- **Research Scope**: ✅ (หลังยอม DUA) · **Competition Scope**: ❌ · **Commercial Scope**: ❌
- **เหมาะกับ Train/Validation**: วิจัยภายใน (validation สำรอง/สูงคุณภาพ) — **ห้ามใช้ผลในผลงานแข่งขัน**
- **เงื่อนไขที่ยังต้องยืนยัน**: ยอมรับ DUA อย่างเป็นทางการ, professional review, IRB-equivalent ของฝ่ายเรา
- **วันที่ตรวจสอบ license**: 2026-10-04

### 4. COHFACE — **PENDING — RESEARCH ONLY — DO NOT USE FOR COMPETITION OR PRODUCTION WITHOUT EXPLICIT APPROVAL**
- **Official URL**: https://www.idiap.ch/dataset/cohface · https://zenodo.org/record/4081054 · **Version**: 2016
- **License**: COHFACE EULA — non-commercial เท่านั้น (ส่งหลังยื่นคำขอ)
- **Access/DUA**: ไฟล์ restricted — ยื่นคำขอโดยผู้มีตำแหน่งถาวร + อีเมลองค์กร (ห้าม gmail)
- **Participant/Recording**: 40 subjects / 160 คลิป × 1 นาที
- **RR/HR Reference**: BVP + breathing (BioGraph) — **ไม่มี RR waveform แบบ capnometry แต่มี breathing rate**
- **Sampling Rate**: video 20 Hz
- **ข้อจำกัด**: fps ต่ำ, ต้องยื่นขอ, citation บังคับ (arXiv:1709.00962)
- **Research Scope**: ✅ หลังอนุมัติ · **Competition Scope**: ❌ · **Commercial Scope**: ❌
- **เหมาะกับ Train/Validation**: domain-shift/subgroup ทดสอบ (webcam บ้าน = ใกล้ใช้จริง)
- **เงื่อนไขที่ยังต้องยืนยัน**: EULA ฉบับจริง, professional review, ผู้ลงนาม
- **วันที่ตรวจสอบ license**: 2026-10-04

### 5. PURE — **NOT CLEARED FOR USE**
- **Official URL**: หน้าเดิม KIT ปิด; สิทธิ์ที่ TU Ilmenau (`nikr-datasets-request@tu-ilmenau.de`) · **Version**: ยังไม่ยืนยัน
- **License**: ต้องเซ็น agreement — ข้อความ license ยืนยันไม่ได้ · **Access/DUA**: signed agreement
- **Participant/Recording**: ~10 subjects (ยังไม่ยืนยัน) · **RR/HR Reference**: pulse oximeter (HR) — **ไม่มี RR**
- **Sampling Rate**: 30 fps (ยังไม่ยืนยัน) · **ข้อจำกัด**: subject น้อย, HR เท่านั้น
- **Research/Competition/Commercial Scope**: ไม่ชัด → ทุกขอบเขต **NOT CLEARED**
- **เหมาะกับ Train/Validation**: ไม่แนะนำ (HR-only + ขอบเขตไม่ชัด)
- **เงื่อนไขที่ยังต้องยืนยัน**: agreement ฉบับจริง, license ข้อความ, ethics

### 6. WESAD — **NOT CLEARED FOR USE**
- **Official URL**: https://archive.ics.uci.edu/dataset/465 (DOI 10.24432/C57K5T) · **Version**: 2018
- **License**: หน้า UCI = "See linked dataset" — **ยืนยันข้อความ license ไม่ได้**
- **Participant/Recording**: 15 subjects (lab) · **RR/HR Reference**: respiration จาก chest RespiBAN 700 Hz (มี respiration แต่ไม่ใช่ rPPG benchmark)
- **ข้อจำกัด**: 15 คน, เป้าหมายเดิม stress detection
- **Research/Competition/Commercial Scope**: ไม่ชัด → **NOT CLEARED**
- **เงื่อนไขที่ยังต้องยืนยัน**: license จาก eti.uni-siegen.de (ต้นทาง)

### 7. CapnoBase — **NOT CLEARED FOR USE**
- **Official URL**: https://www.capnobase.org/ — **เว็บล้ม (timeout ×2, 2026-10-04)**
- **License/Access/Scope**: ยืนยันไม่ได้ทั้งหมด → ต้องตรวจใหม่เมื่อเว็บกลับมา

### 8. UBFC-rPPG — **NOT CLEARED FOR USE**
- **Official URL**: https://sites.google.com/site/ybenezeth/ubfc-rppg — **login-wall ตรวจไม่ได้**
- **License/Access/Scope**: ยืนยันไม่ได้ → ต้องหาช่องทาง contact ผู้ดูแลก่อน

---

## Approval Gate — 13 รายการ (ใช้ต่อ dataset ที่ขออนุมัติ)

| # | รายการ | BIDMC | MIMIC-III WDB | VitalDB | COHFACE |
|---|---|---|---|---|---|
| 1 | Official Source ยืนยันแล้ว | ✅ | ✅ | ✅ | ✅ |
| 2 | Version ระบุ | ✅ | ✅ | ✅ | ✅ |
| 3 | License ยืนยัน (ข้อความจริง) | ✅ | ✅ | ✅ | ✅ (EULA ต้องขอ) |
| 4 | Access Terms ชัด | ✅ | ✅ | ✅ (DUA) | ✅ (ต้องยื่นคำขอ) |
| 5 | Competition Scope ชัด | ✅ ได้ | ✅ ได้ (share-alike) | ❌ ห้าม | ❌ ห้าม |
| 6 | Ethics Requirement ชัด | ⚠️ deidentified (หน้าไม่แสดงรายละเอียด) | ✅ IRB อนุมัติ | ✅ IRB | ⚠️ อยู่ใน EULA |
| 7 | Reference Signal ตรงโจทย์ | ✅ RR manual + HR | ✅ RR/HR numerics | ✅ RR capnography + HR | ⚠️ breathing rate @20Hz video |
| 8 | Participant IDs พร้อม | ✅ (ตอนดาวน์โหลด) | ✅ | ✅ | ✅ |
| 9 | Leakage Prevention พร้อม (split ตามคน) | ✅ เครื่องมือพร้อม | ✅ | ✅ | ✅ |
| 10 | Storage Outside Git พร้อม | ⬜ ต้องจัดเตรียม | ⬜ (ขนาดใหญ่) | ⬜ | ⬜ |
| 11 | Checksum หลังดาวน์โหลด | ⬜ (หลังอนุมัติ) | ⬜ | ⬜ | ⬜ |
| 12 | Deletion Plan ระบุ | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | Professional Review | ❌ | ❌ | ❌ | ❌ |

**ขาดข้อใดข้อหนึ่ง → สถานะ: PENDING — DO NOT DOWNLOAD OR TRAIN** (ปัจจุบันทั้ง 4 ชุดเป็น PENDING เพราะขาดข้อ 10-13 + professional review)

## สิ่งที่ขออนุมัติ (รอการยืนยันจากผู้ใช้)

- **Dataset ที่ต้องอนุมัติ**: BIDMC PPG and Respiration (แนะนำชุดแรก) — ทางเลือกถัดไป MIMIC-III Waveform
- **Purpose**: Offline validation ของ camera RR pipeline (เทียบ manual breath annotations) — ไม่ใช่ train
- **License**: ODC-By 1.0 (open) — ให้ attribution
- **Competition use**: ได้ (แสดง attribution)
- **Expected storage**: ~208 MB uncompressed, เก็บนอก Git (path นอก repo + checksum log)
- **Professional review**: จำเป็นก่อนดาวน์โหลดและก่อนตีพิมพ์ผล
- **Ethics/DUA**: dataset deidentified open access — ยังต้องผ่านผู้เชี่ยวชาญยืนยันว่าไม่ต้องมี IRB เพิ่ม

## Offline Validation — ขั้นตอนเมื่อได้รับอนุมัติ (ยังไม่ดำเนินการ)

1. Download ไป**นอก Git** (storage เฉพาะ) → บันทึก manifest + checksum (SHA-256 ต่อไฟล์)
2. QC: ตรวจ duplicate/missing/unit/timestamp/alignment (BIDMC: record ละ 8 นาที @125Hz)
3. ตรวจ participant leakage (`assertNoParticipantLeakage`) → แบ่ง train/validation/test **ตาม participant** (60/20/20, seed บันทึก) — **ห้ามสุ่มตาม frame**
4. ประเมินตามลำดับ: (1) Persistence/Naive → (2) Rule/Moving Average → (3) Current Camera Pipeline → (4) Candidate model เฉพาะเมื่อได้รับอนุมัติแยก
5. คำนวณผ่าน `computeAgreementMetrics()` เท่านั้น — รายงาน N/MAE/RMSE/Bias/MedianAE/Bland-Altman/Acceptable Error/Failure/Abstention/Quality Gate Coverage/Subgroups
6. **ห้ามใช้ test set ปรับ threshold**; calibration ใช้ validation เท่านั้น

**สถานะ metrics ปัจจุบันทุกช่อง: NOT AVAILABLE — NO VALIDATED RUN**
