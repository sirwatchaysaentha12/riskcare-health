# DATASET-GOVERNANCE-AND-LICENSE-GATE.md — ประตูควบคุม License และการกำกับดูแล Dataset

> Phase 9 · อัปเดต 2026-10-04 · มีผลกับ dataset ภายนอกทุกแหล่ง (ดูผลตรวจใน EXTERNAL-DATASET-REVIEW.md)

## 1. License Gate — ทุก Dataset ต้องผ่านก่อนดาวน์โหลด/ใช้งาน

| ขั้น | เงื่อนไข | ผู้อนุมัติ |
|---|---|---|
| G1 ตรวจหน้า official | เปิดอ่านหน้า dataset + license จริง, บันทึก URL + วันที่ตรวจ | นักพัฒนา |
| G2 จำแนกสถานะ | CLEARED / RESEARCH-ONLY / NOT CLEARED FOR USE (ตามตารางใน EXTERNAL-DATASET-REVIEW.md) | นักพัฒนา |
| G3 สิทธิ์จริง | ถ้าต้องมี agreement/EULA/registration → ยื่นขอจริงและเก็บสำเนาเอกสารสิทธิ์ | ผู้ดูแลโครงการ |
| G4 ขอบเขตการใช้ | ตรวจว่า "การแข่งขัน/เผยแพร่สาธารณะ" เข้าข่ายการใช้ที่ license อนุญาตหรือไม่ (non-commercial datasets ตัดออกจากผลงานแข่งขัน) | ผู้ดูแลโครงการ + ผู้เชี่ยวชาญด้านจริยธรรม |
| G5 บันทึก provenance | บันทึก license/version/DOI/citation ที่ใช้ลงไฟล์ provenance | นักพัฒนา |

**กติกาตัดสิน**: ถ้าไม่พบข้อความ license จากหน้า/เอกสาร official โดยตรง → **NOT CLEARED FOR USE** (ห้ามเดา, ห้ามใช้ snippet จากบุคคลที่สามแทนการตรวจต้นทาง)

## 2. สถานะปัจจุบัน (2026-10-04)

- **CLEARED**: BIDMC PPG and Respiration (ODC-By 1.0), MIMIC-III Waveform (ODbL 1.0 — share-alike)
- **RESEARCH-ONLY**: VitalDB (CC BY-NC-SA + DUA), COHFACE (non-commercial EULA)
- **NOT CLEARED FOR USE**: PURE (agreement pending), WESAD (license ambiguous), CapnoBase (เว็บล้ม), UBFC-rPPG (login-wall)

## 3. กฎการจัดเก็บข้อมูล (เมื่อผ่าน Gate)

1. **ห้ามดาวน์โหลด dataset เข้า Git repository** เด็ดขาด (รวม compressed/cache)
2. เก็บภายนอก repo ใน storage เฉพาะของโครงการ พร้อมบันทึก: ชื่อ dataset, version, วันที่ดาวน์โหลด, hash ของไฟล์, license ณ วันดาวน์โหลด
3. ผู้เข้าถึง = สมาชิกโครงการที่อยู่ในขอบเขตสิทธิ์ของ license เท่านั้น
4. ห้ามแจกจ่ายต่อ/re-distribute นอกเหนือ license (ODbL share-alike: derivative database ต้องใช้ ODbL)
5. ลบตามเงื่อนไข license เมื่อเลิกใช้

## 4. Attribution ที่ต้องแนบกับผลงาน

| Dataset | ข้อความอ้างอิงขั้นต่ำ |
|---|---|
| BIDMC PPG and Respiration | PhysioNet, "BIDMC PPG and Respiration" v1.0.0, DOI 10.13026/C2208R (ODC-By 1.0) |
| MIMIC-III Waveform | Johnson et al. Sci Data 3:160035 (2016) + PhysioNet, DOI 10.13026/c2607m (ODbL 1.0) |
| VitalDB | Lee HC et al. Sci Data 9:279 (2022), DOI 10.1038/s41597-022-01411-5 (CC BY-NC-SA 4.0) |
| COHFACE | Heusch, Anjos & Marcel, arXiv:1709.00962 (Idiap, non-commercial EULA) |

## 5. Competition Use — กฎพิเศษ

- ผลงานแข่งขันที่อ้างผลจาก dataset ใด ต้องใช้เฉพาะ dataset ที่ **CLEARED** สำหรับเชิงพาณิชย์/เผยแพร่
- RESEARCH-ONLY datasets (VitalDB/COHFACE) — ห้ามนำผลที่ train/eval จาก dataset เหล่านี้ไปโชว์เป็นความสามารถของผลิตภัณฑ์ (ใช้พูดถึง "แผนงานวิจัย" ได้โดยระบุข้อจำกัด license)
- ทุกครั้งที่ระบุ dataset ในสไลด์/รายงาน ต้องแนบ license + citation ตามข้อ 4

## 6. การเปลี่ยนสถานะ

สถานะ CLEARED/NOT CLEARED เปลี่ยนได้เมื่อ: ตรวจ license ใหม่จาก official source, ได้รับ signed agreement, หรือ license ฉบับของ dataset เปลี่ยน — ต้องอัปเดต EXTERNAL-DATASET-REVIEW.md พร้อมวันที่ตรวจล่าสุดทุกครั้ง
