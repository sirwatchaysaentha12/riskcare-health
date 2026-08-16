# Profile Surface

- Routes: `/profile`, `/history`
- Purpose: แก้ไขข้อมูลส่วนตัวและดูประวัติการประเมิน
- Editable fields: ชื่อ-นามสกุล, จังหวัดที่อยู่ปัจจุบัน
- Avatar: JPG/PNG preview, LocalStorage fallback และ Supabase Storage
- History: แสดงระดับความเสี่ยงภาษาไทย วันเวลา และข้อมูลจาก `risk_assessments`
- States: loading, save success, save error, empty history
