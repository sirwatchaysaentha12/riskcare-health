# VALIDATION-MODALITY-DECISION.md — ตัดสินใจ Modality ของ Validation (Phase 12)

> 2026-10-04 · แก้ blocker จาก Phase 11: แยกให้ชัดว่าต้องการตรวจ "ส่วนไหน" ของระบบ และ dataset ใดตรงกับ input จริง
> **สถานะ: BLOCKED — WAITING FOR MODALITY SELECTION AND DATASET APPROVAL** (ยังไม่ Download ยังไม่ Train)

## ข้อเท็จจริงตั้งต้น (ยืนยันแล้วใน Phase 11)

- BIDMC **ไม่มี RGB Video** — มี PPG + impedance respiration + ECG (waveform 125 Hz)
- Camera pipeline ของระบบรับ **Video/Pose** เป็น input
- BIDMC จึงใช้ยืนยัน camera accuracy แบบครบวงจรไม่ได้ = `NOT COMPARABLE — DATA MODALITY MISMATCH`
- COHFACE **มี webcam video จริง** (40 คน, 640×480 @20 Hz) แต่ต้องผ่าน non-commercial EULA

## Decision Matrix

| ทางเลือก | Dataset | Input Modality | ตรวจอะไรได้ ✅ | ตรวจอะไรไม่ได้ ❌ | License | สถานะ |
|---|---|---|---|---|---|---|
| **A** | BIDMC (PhysioNet) | Respiration waveform / PPG / ECG — **ไม่มีวิดีโอ** | Signal processing: peak counting, periodicity/CV gate, agreement ระหว่าง algorithm output กับ manual breath annotations | Camera accuracy · Pose accuracy · End-to-end RGB video accuracy · Clinical accuracy | ODC-By 1.0 (open, competition ได้) | PENDING รอเลือก + อนุมัติ |
| **B** | COHFACE (Idiap) | Webcam RGB video 640×480 @20 Hz + reference BVP/breathing | Video/camera-domain signal validation (ใกล้สภาพใช้จริง) · domain-shift | Clinical accuracy · ไม่ครอบคลุม shoulder-motion RR โดยตรง (COHFACE วัดใบหน้า) | Non-commercial EULA — competition use ไม่ระบุ | ❌ NOT CLEARED FOR COMPETITION USE — PENDING รอเลือก + EULA |
| **C** | BIDMC + COHFACE | สอง modality แยก track | Track A: Signal processing · Track B: Video domain | End-to-end clinical accuracy (ทั้งคู่) | ต่างเงื่อนไขกัน (ODC-By vs EULA) | PENDING รอเลือก + อนุมัติทั้งคู่ |

**กฎสำคัญ (ตามโจทย์):**
- Metrics จาก A และ B **ห้ามรวมเป็น Accuracy เดียว** — ต้องรายงานแยก Track A / Track B เสมอ
- ห้าม concatenate datasets ข้าม domain โดยไม่วิเคราะห์ domain shift
- ทางเลือกใดไม่ว่าอย่างไรก็ **ไม่ใช่ Clinical Validation** และห้ามอ้าง clinical accuracy

## การเปรียบเทียบข้อดี/ข้อเสีย (สำหรับผู้ตัดสินใจ)

### A — BIDMC Signal Algorithm Validation only
- ✅ License เปิด (ODC-By) — ใช้ได้รวมถึงงานแข่งขัน · เล็กพอ (53×8 นาที) เริ่มเร็ว · มี manual breath annotations คุณภาพสูง
- ❌ ไม่พิสูจน์กล้อง/วิดีโอเลย · ประชากร ICU · ตรวจได้แค่ "ชิ้นส่วน signal processing"

### B — COHFACE Video Domain Validation
- ✅ มีวิดีโอ webcam จริง (ใกล้การใช้งานจริง) · ตรวจ rPPG/video domain ได้
- ❌ EULA ส่งหลังยื่นขอ · **ไม่ระบุเรื่อง competition/presentation** → หากจะโชว์ผลในการแข่งขัน = ติดขัด · reference เป็น BVP/breathing (ใบหน้า ไม่ใช่ไหล่) — วัด pipeline กล้องได้บางส่วน

### C — ทำทั้ง A และ B (แยก Track)
- ✅ ครอบคลุมทั้ง "ส่วนประมวลผลสัญญาณ" และ "video domain" แยกกันอย่างถูกต้องตามหลัก
- ❌ ภาระเอกสาร/สิทธิ์มากที่สุด (ODC-By + EULA) · COHFACE track ยังติด NOT CLEARED FOR COMPETITION USE

## ขั้นตอนหลังอนุมัติ (แยกตามทางเลือก — ยังไม่ดำเนินการ)

**หากเลือก A**: Download BIDMC นอก Git (หลังติ๊กอนุมัติ) → QC waveform/reference → กำหนดหน้าต่าง 30 วิ → split ตาม participant → รัน signal processing evaluation (รายงานว่า **Signal-only — ห้ามเรียก Camera Accuracy**)

**หากเลือก B**: ยืนยัน EULA/competition scope (ต้องขอ EULA ฉบับจริงจาก Idiap ก่อน) → ยื่นขอ access → download นอก Git → QC video/reference → participant leakage check → video domain evaluation (รายงาน **Research-only — ห้ามใช้เป็น Clinical Claim**)

**หากเลือก C**: ทำ A และ B **แยก Track** — Track A: BIDMC Signal Processing · Track B: COHFACE Video Domain · ห้ามรวม metrics ข้าม track

## ข้อห้ามคงเดิม

ไม่ว่าเลือกทางใด: ห้าม train production model · ห้าม replace existing model · ห้ามแก้ RR Formula/Quality Gate/Risk Score · ห้ามแก้ threshold หลังเห็นผล · ห้าม claim accuracy improvement/clinical validation · การปรับ algorithm ทำได้เฉพาะใน research branch/offline experiment หลังมี protocol และ approval แยก

**เลือกทางเลือกและอนุมัติได้ที่: VALIDATION-APPROVAL-FORM.md**
