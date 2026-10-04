# Experiment Plan — Hourly PM2.5 Forecast (ออกแบบแล้ว · ยังไม่รัน)

เป้าหมายเชิงกลยุทธ์: ข้อมูลรายชั่วโมงเป็น**ทางเดียว**ที่จะยก Accuracy@±2 ขึ้นไปหา 87–90%
(พิสูจน์เพดานแล้ว: daily data เปลี่ยนวันต่อวัน median 3.0 µg/m³ — 62% ของวันเลื่อนเกิน ±2)

## การทดลองที่ 1 — Direct hourly forecast

- โมเดล: HGB/XGB ต่อ horizon (24 / 48 / 72 ชั่วโมง) — ทำนายค่า pm25 "ณ ชั่วโมงนั้น"
- Features: lag 1,3,6,12,24,48,72 ชม. · rolling mean/median/std 3,6,12,24 ชม. · rate of change (diff 1,6,24) · hour_of_day · day_of_week · is_high_season · วันหยุด (จส.1001 อาจเพิ่มภายหลัง)
- Evaluation: rolling-origin เดือนละครั้ง, test = 30 วันหลัง origin ล่าสุดเสมอ · ห้าม tune บน test
- รายงาน: แยก 24/48/72 ชม. — แล้ว **aggregate เป็นรายวันอย่างโปร่งใส** (mean ของ 24/48/72 ทำนาย) เพื่อเทียบ Accuracy@±2 รายวันกับโมเดล daily ปัจจุบัน

## การทดลองที่ 2 — Daily aggregation forecast

- Features รายวันสร้าง**จากชั่วโมงจริง**: mean/max/min 24 ชม. · ค่าตอนกลางคืน (00–06) · ค่าเช้า (06–10) · ค่าคืนวันก่อน · ความชัน 6 ชม.ล่าสุด · ชั่วโมงพีค
- โมเดล: เหมือนการทดลอง 1 แต่ target = ค่าเฉลี่ยรายวันถัดไป (ตรงกับ UI ปัจจุบัน)
- ข้อได้เปรียบ: แม่นกว่า daily-only เพราะเห็น "วันเริ่มต้นแบบไหน" (เช่น ฝุ่นพีคตอนดึก = วันนี้จะแย่)
- Evaluation: เทียบ head-to-head กับ daily baseline (pers-ma7blend) และ daily ML บน holdout เดียวกัน

## เกณฑ์ตัดสิน (เหมือนเดิม)

- Accuracy@±2 บน all-season holdout — เป้า 87–90% ยังไม่รับประกัน แต่ hourly ยกเพดานได้จริงเพราะเห็นพฤติกรรมภายในวัน
- ต้องชนะ daily baseline ทุก horizon ก่อนเสนอสลับ production

## ลำดับงานเมื่ออนุมัติ

1. สร้างตาราง `air_quality_hourly` (ตาม HOURLY_DATA_SPEC.md)
2. เขียน hourly crawler (paginate + กรองวันฝั่งเรา + rate-limit + resume)
3. รวบรวมย้อนหลัง 2021→ปัจจุบัน (ประเมิน QC ตาม spec)
4. รันการทดลอง 1–2 (ห้ามแตะ production จนกว่าจะชนะเกณฑ์)
