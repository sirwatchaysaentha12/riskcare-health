# COHFACE-LICENSE-REVIEW.md — ตรวจ License/Access Terms ของ COHFACE จาก Official Source

> Phase 12 · ตรวจเมื่อ 2026-10-04 · เปิดอ่านจริง 2 หน้า official: Idiap dataset page + Zenodo record 4081054
> **สรุปสถานะ: NOT CLEARED FOR COMPETITION USE** (research-only ชัดเจน — ส่วน competition/presentation ไม่ปรากฏในข้อความ public)

## 1. Official Sources ที่เปิดอ่าน

| หน้า | URL | สิ่งที่ได้ |
|---|---|---|
| Idiap dataset page | https://www.idiap.ch/dataset/cohface | คำอธิบาย dataset, สัญญาณ, citation บังคับ — **ไม่มี license/EULA บนหน้า** (ส่งไป Zenodo) |
| Zenodo record 4081054 | https://zenodo.org/record/4081054 | **License = "COHFACE EULA"** + เงื่อนไขการขอเข้าถึง |

## 2. ข้อความจริงจาก Zenodo (quote)

- License: **"COHFACE EULA"** — "a dedicated non-commercial EULA that will be sent after application"
- Access: "The record is publicly accessible, but **files are restricted**" — ต้อง login + ยื่นคำขอ
- ขอบเขต: "Access to the dataset is based on an End-User License Agreement. **The use of the dataset is strictly restricted to non-commercial research.**"
- ผู้ยื่น: "authorized signatory" ต้องมีตำแหน่งถาวร + อีเมลองค์กรเดียวกัน ("generic email providers such as gmail will be rejected")
- Citation: Heusch, Anjos & Marcel, "A reproducible study on remote heart rate measurement" (arXiv:1709.00962, 2016)

## 3. ประเด็นที่โจทย์กำหนดให้ตรวจ — ผลรายข้อ

| ประเด็น | ผลจากหน้า public | สรุป |
|---|---|---|
| Non-commercial restriction | ✅ ระบุชัด "strictly restricted to non-commercial research" | ยืนยันแล้ว |
| Research-only scope | ✅ ยืนยันแล้ว | ใช้วิจัยภายในได้ (หลังได้สิทธิ์) |
| EULA ฉบับเต็ม | ❌ "will be sent after application" — ข้อความจริงยังไม่เป็น public | **ต้องยื่นขอและอ่าน EULA จริงก่อน download** |
| Redistribution (แจกจ่ายไฟล์ต่อ) | ❌ ไม่ปรากฏบนหน้า public | ไม่ทราบ — ต้องดูใน EULA |
| Deletion obligation | ❌ ไม่ปรากฏ | ไม่ทราบ — ต้องดูใน EULA |
| Citation requirement | ✅ บังคับอ้างอิง Heusch et al. 2016 | ยืนยันแล้ว |
| **Competition/Presentation use** | ❌ **ไม่ปรากฏทั้งสองหน้า** | **NOT CLEARED FOR COMPETITION USE** |
| Ethics/consent statement | ❌ ไม่ปรากฏบนหน้า public | ต้องดูใน EULA/สอบถาม Idiap |

## 4. สรุป

- ใช้เพื่อ **วิจัยภายใน (non-commercial)** ได้ **หลังยื่นคำขอและได้รับ/อ่าน EULA จริง**
- **NOT CLEARED FOR COMPETITION USE** — การนำผลไปโชว์ในการแข่งขัน (มีลักษณะ non-commercial แต่ไม่ใช่ "non-commercial research" แบบที่ EULA นิยามชัด) ยังไม่มีข้อความอนุญาตรองรับ → ห้ามถือว่าได้สิทธิ์ จนกว่าจะถาม Idiap และได้คำตอบเป็นลายลักษณ์อักษร
- Redistribution/Deletion/Publication-of-results: ไม่ทราบ — ทั้งหมดอยู่ใน EULA ฉบับเต็ม

## 5. ขั้นถัดไปหากเลือกทาง B/C (ต้องทำก่อน download)

1. ยื่นคำขอผ่าน Zenodo (ผู้ลงนามตำแหน่งถาวร + อีเมลองค์กร)
2. ได้รับ EULA → ตรวจ 4 ประเด็นที่ยังไม่ทราบ: redistribution, deletion, competition/presentation, publication of results
3. รายงานผลการตรวจ EULA ในไฟล์นี้ (อัปเดตวันที่) ก่อนดำเนินการต่อ
4. **ห้าม download ก่อนข้อ 1-3 เสร็จและได้รับอนุมัติ**
