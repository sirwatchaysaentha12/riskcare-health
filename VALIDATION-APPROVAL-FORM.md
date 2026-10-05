# VALIDATION-APPROVAL-FORM.md — แบบฟอร์มอนุมัติ Modality และ Dataset (Phase 12)

> **สถานะ: ยังไม่ได้กรอก — รอผู้อนุมัติ (ผู้ใช้) เลือกและติ๊กเอง**
> ห้าม AI/ผู้พัฒนาติ๊กแทน · คำว่า "ทำต่อ" ไม่ถือเป็นการอนุมัติ · อนุมัติครบทุกช่องที่จำเป็นแล้วเท่านั้นจึงจะเริ่ม Download/QC/Validation ได้
> อ้างอิงข้อมูลตัดสินใจ: VALIDATION-MODALITY-DECISION.md · COHFACE-LICENSE-REVIEW.md · DATASET-APPROVAL-PACKET.md

## 1. เลือกทางเลือก (เลือก**อย่างใดอย่างหนึ่ง**)

```
[ ] A — BIDMC Signal Algorithm Validation only
      (ตรวจเฉพาะ signal processing: peak/periodicity vs manual breath annotations
       ไม่พิสูจน์กล้อง/วิดีโอ — License: ODC-By 1.0, competition ได้)

[ ] B — COHFACE Video Domain Validation หลัง License Approval
      (ตรวจ video/camera-domain จาก webcam จริง 40 คน
       License: non-commercial EULA — ต้องยื่นขอก่อน
       ⚠️ ปัจจุบัน NOT CLEARED FOR COMPETITION USE)

[ ] C — ทำทั้ง A และ B แยก Track
      (Track A: BIDMC Signal Processing · Track B: COHFACE Video Domain
       ห้ามรวม Metrics สอง Track เป็น Accuracy เดียว)
```

ทางเลือกที่เลือก: ______________  วันที่อนุมัติ: ______________  ลงชื่อ/ผู้อนุมัติ: ______________

## 2. การยืนยันบังคับ (ติ๊กครบทุกข้อจึงมีผล)

```
[ ] อนุมัติ Purpose เท่านั้น ไม่ได้อนุมัติ Training
[ ] อนุมัติให้ Download Dataset ที่เลือก (หลังยืนยัน license ซ้ำจาก official source ณ วันดาวน์โหลด)
[ ] ยืนยัน Storage นอก Git (เช่น C:\Users\ACER\research-data\ — ห้ามเข้า repository)
[ ] ยืนยันห้ามใช้ข้อมูลอาสาสมัครจริงของโครงการ
[ ] รับทราบว่าไม่ใช่ Clinical Validation
[ ] รับทราบว่า BIDMC ไม่ใช่ Camera Accuracy (หากเลือก A/C — เป็น Signal-only)
[ ] รับทราบว่า COHFACE ปัจจุบัน NOT CLEARED FOR COMPETITION USE (หากเลือก B/C)
[ ] Professional Review: [ ] ดำเนินการแล้ว (ระบุ: ____________) / [ ] ยังต้องดำเนินการ
```

## 3. เงื่อนไขเพิ่มเติมตามทางเลือก

**หากเลือก B หรือ C (มี COHFACE):**
```
[ ] ยื่นคำขอเข้าถึงผ่าน Zenodo (ผู้ลงนามตำแหน่งถาวร + อีเมลองค์กร) และได้รับ EULA แล้ว
[ ] EULA ฉบับจริงถูกตรวจ 4 ประเด็นแล้ว: redistribution / deletion / competition-presentation / publication of results
[ ] ยอมรับว่า competition use ยังคงเป็น NOT CLEARED FOR COMPETITION USE จนกว่า Idiap ยืนยันเป็นลายลักษณ์อักษร
```

## 4. ผลของการอนุมัติ

- อนุมัติแล้ว = เริ่มได้เฉพาะ: Download (นอก Git) → QC → Leakage/Split → Evaluation ตาม track ที่เลือก → รายงานผลตาม MODEL-EVALUATION-PLAN.md
- **ไม่อนุมัติ Training** · **ไม่อนุมัติ Production replacement** · **ไม่อนุมัติการอ้าง clinical accuracy**
- ผลทุกอย่างรายงานแยก Track A/Track B — ห้ามรวมเป็น accuracy เดียว

## 5. สถานะการอนุมัติ

| รายการ | สถานะ |
|---|---|
| เลือกทางเลือก A/B/C | ✅ **A — BIDMC/PhysioNet Signal Validation only** (ประกาศโดยผู้ใช้ในคำสั่ง Phase 13, 2026-10-04 — ถอดร้อยไว้ใน TRACK-A-APPROVAL-RECORD.md) |
| Checklist ข้อ 2 ครบ | ✅ ครบตามคำประกาศของผู้ใช้ (purpose-only, download, storage นอก Git, ไม่ใช้อาสาสมัครจริง, ไม่ใช่ clinical, BIDMC ≠ camera accuracy) |
| Professional review | ⚠️ ยังต้องดำเนินการ (ก่อนตีความผลเชิงคลินิกใด ๆ) |
| **ผลรวม** | **APPROVED — Track A (purpose-only) บันทึกใน TRACK-A-APPROVAL-RECORD.md · ยังห้าม Train ห้ามเปลี่ยน Production** |
