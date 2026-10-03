# Phase 9 — Cost, Monitoring และ Rollback

สถาปัตยกรรมที่เลือก: **Batch Prediction** (ไม่เปิด Online Endpoint ค้าง) — รายละเอียดใน VERTEX_CONSOLE_STEPS.md

## ค่าใช้จ่ายโดยประมาณ (Region แนะนำ: asia-southeast1)

| รายการ | รูปแบบ | ประมาณการต่อเดือน |
|---|---|---|
| Dataset storage (CSV 2.4 MB ใน Cloud Storage) | มาตรฐาน | < US$0.01 |
| Training (Tabular Workflow, 1–3 node-hours/รอบ) | เทรน 1 ครั้ง/เดือน | ~US$2–10 |
| Batch Prediction (33 สถานี × 3 วัน = ~100 แถว/วัน) | เก็บเงินตาม node-hour ที่ใช้จริง (ปิดเอง) | ~US$0.5–2 (แพงกว่านี้มากถ้าใช้ online endpoint: ~US$70–180/เดือน สำหรับ node ค้าง) |
| Supabase ตาราง pm25_forecast_daily | แถวไม่กี่พันแถว | 0 (อยู่ใน quota เดิม) |

*ตัวเลขเป็นการประมาณจากราคา public ณ 2026 — ตรวจจริงที่ Billing ของ project ก่อนเปิดใช้*

## Schedule

- Ingest ข้อมูลจริง: cron 03:15 Asia/Bangkok (มีอยู่แล้ว)
- Batch Prediction แนะนำ: **วันละ 1 ครั้งหลัง ingest** (เช่น 04:00) — ตอนนี้ทำแบบ manual import ก่อน, อนาคตผูก Cloud Scheduler → Cloud Run/Functions ได้

## Monitoring

- Import script คืน exit code 1 เมื่อ format/query พัง → ใส่ alert ที่ Cloud Monitoring บน job หรือ log-based alert ภายหลัง
- ฝั่ง API: ถ้าตาราง forecast ว่าง/หมดอายุ → ตอบกลับด้วย baseline และ `modelVersion: baseline-ma3trend-v1` (ผู้ใช้ไม่เจอ error, แต่จะเห็นป้าย "คาดการณ์จากแนวโน้มย้อนหลัง")

## Rollback (กลับไปใช้ Baseline)

1. ลบแถวใน `pm25_forecast_daily` (หรือไม่ import รอบใหม่) — API กลับไป baseline ทันที ไม่ต้อง deploy ใหม่
2. ถ้าต้องการถอนทั้งระบบ Vertex: ลบตาราง (API ทนได้เพราะ catch table-missing) + ลบ training pipeline/batch job ใน Console
3. ไม่มี Online Endpoint ที่ต้อง undeploy — ถ้าอนาคตสร้าง: Vertex AI → Endpoints → เลือก endpoint → **Delete endpoint** (การ undeploy model อย่างเดียวไม่หยุดค่าใช้จ่าย ต้องลบ endpoint เอง)

## Data retention

- `air_quality_daily`: คงไว้ทั้งหมด (จำเป็นสำหรับ retrain — ~3 ปีเท่ากับ ~25K แถว ไม่มีข้อมูลสุขภาพส่วนบุคคล)
- `pm25_forecast_daily`: เก็บ 30 วันล่าสุดพอ (แถวเก่าถูก upsert ทับตามวัน) — ลบเกินได้ด้วย `delete where date < current_date - 30`
- Model versions: เก็บชื่อเวอร์ชันในคอลัมน์ model_version เพื่อย้อนตรวจผลได้ตามสเปก
