# Health Planning Surface

## Routes

- /health-planning — หน้ารวมตัวเลือกการวางแผนสุขภาพ
- /exercise-plan — แบบฟอร์มสร้างแผนการออกกำลังกายแบบ 3 ขั้นตอน
- /health-tracker — แบบฟอร์มติดตามอาการและสร้างนัดหมายผ่านปฏิทิน

## Exercise Plan

ผู้ใช้กรอกข้อมูลทีละขั้นตอน:

1. อายุ น้ำหนัก และส่วนสูง
2. จำนวนวันออกกำลังกายและระดับความหนัก
3. โรคประจำตัว

ระบบนำข้อมูล health_risk_group จาก profiles และค่า AQI มาใช้ปรับความหนักของแผน โดยกลุ่มความเสี่ยงสูงหรือค่า AQI สูงจะได้รับแผนเบาและเน้นกิจกรรมในร่ม

ผลลัพธ์ถูกบันทึกลงตาราง health_plans

## Health Tracker

แบ่งเป็น 2 ขั้นตอน:

1. บันทึกอาการ โรคประจำตัว และยาที่ใช้
2. เลือกวันจากปฏิทิน แล้วกรอกเวลา แพทย์ การเตรียมตัว และสิ่งที่ต้องนำไป

ข้อมูลถูกบันทึกลง:

- health_symptom_logs
- health_medications
- health_appointments

รายการนัดหมายจะแสดงกลับในปฏิทินหลังบันทึกสำเร็จ

## Visual System

- สีหลัก: เขียวสุขภาพและพื้นขาว
- Step indicator แสดงเฉพาะขั้นตอนปัจจุบัน
- การ์ดใช้ขอบโค้งและ shadow แบบนุ่ม
- ฟอร์มใช้ fluid typography ด้วย clamp()
- รองรับมือถือ Tablet และ Desktop
- ป้องกัน horizontal overflow ด้วย max-width: 100vw และ overflow-x: hidden

## Accessibility

- ใช้ปุ่มและลิงก์ที่กดด้วยคีย์บอร์ดได้
- Input ทุกตัวมี label
- มีสถานะ success/error สำหรับการบันทึก
- ปุ่ม submit แสดงสถานะกำลังบันทึก

## Notification Limitation

หน้าเว็บสามารถขอสิทธิ์ Notification และลงทะเบียน Service Worker ได้แล้ว

การแจ้งเตือนล่วงหน้า 1 วัน แม้ผู้ใช้ปิดเว็บ ต้องมี Web Push backend, VAPID key และระบบ scheduler เช่น Supabase Edge Function หรือ Cron เพิ่มเติม
