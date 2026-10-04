# CONSENT-IMPLEMENTATION-NOTES.md — หมายเหตุการ implement Consent

> อัปเดต 2026-10-04 (Phase 5) · บันทึกว่า consent ถูก implement อย่างไรและอยู่ตรงไหน เพื่อให้ผู้ตรวจตามได้

## โครงสร้าง

| ไฟล์ | บทบาท |
|---|---|
| `frontend/src/components/CameraConsent.jsx` | Consent screen — ข้อความแจ้ง 7 ประเด็น + checkbox 3 อัน |
| `frontend/src/components/RrCameraCapture.jsx` | รับ prop `enabled`; `start()` ปฏิเสธทันทีถ้า `!enabled` (กัน getUserMedia/MediaRecorder ก่อน consent); effect ถอน consent = stopEverything; ปุ่ม "ยกเลิกการวัด (ปิดกล้อง)" ขณะวัด |
| `frontend/src/pages/RespiratoryRiskAssessment.jsx` | ถือ state `consent {camera, limitations, research}` — ค่าเริ่มต้น false ทั้งหมด; `consentReady = camera && limitations` |

## ลำดับการบังคับ (enforcement chain)

1. UI: ปุ่ม "เริ่มวัด" `disabled` จนกว่า `consentReady` + ต้องติ๊ก "รับทราบข้อมูล" ก่อนถึงจะติ๊ก checkbox อื่นได้
2. โค้ด: `start()` ตรวจ `enabled` อีกชั้น — เรียก getUserMedia/MediaRecorder ไม่ได้แม้บังคับเรียกผ่าน console
3. ระหว่างวัด: ถอน consent (เอาติ๊กออก) → effect เรียก `stopEverything()` (หยุด track กล้อง + recorder + RAF) และทิ้ง chunks → คลิปไม่ถูกส่ง backend
4. ปุ่มยกเลิกขณะวัด → เหมือนข้อ 3 + แจ้งผู้ใช้ว่า "คลิปที่บันทึกไม่ถูกส่ง"

## Research Consent

- `consent.research` **ค่าเริ่มต้น false และไม่ถูกตั้งโดยโค้ดใด** — เก็บไว้เป็นสัญญาณเจตนาของผู้ใช้เท่านั้น
- ปัจจุบันยังไม่มีช่องทาง persist ผลวัด — เมื่อจะเริ่มเก็บข้อมูลวิจัยจริง (หลัง IRB) ต้อง: (1) เขียนค่า research consent ลง dataset record, (2) ทำตาม PARTICIPANT-CONSENT-PLAN.md, (3) ตรวจสอบโดยผู้เชี่ยวชาญจริยธรรมก่อนเปิดใช้

## ข้อจำกัดที่รู้ตัว

- Consent state ไม่ persist — ผู้ใช้ยินยอมใหม่ทุก session (ตั้งใจ: ยินยอมต่อการใช้งานจริงแต่ละครั้ง สอดคล้องหลัก granular consent)
- Browser permission prompt ของ getUserMedia ยังแสดงตามปกติของเบราว์เซอร์ (consent ของ app มาก่อนหน้านั้น)
- Consent audit log: มีระดับ "ชั่วคราว" แล้ว (Phase 6) — `console.info('[rrisk-consent]', …)` + CustomEvent `rrisk-consent` บันทึกเฉพาะสถานะยินยอม (camera/limitations/research/acknowledged + timestamp) **ไม่มี** ข้อมูลสุขภาพ/วิดีโอ/ตัวตน — สำหรับ production งานวิจัยต้องยกไปเก็บใน audit store ถาวร (งานเปิดก่อนเก็บข้อมูลจริง)
