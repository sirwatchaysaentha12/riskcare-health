# Vertex AI Console Steps — PM2.5 Daily Forecast (Phase 3 + 5)

เตรียมสำหรับผู้ใช้ที่จะกด Train เองใน Google Cloud Console (ระบบไม่มี GCP credential ใน repo — ตามกฎความปลอดภัย)
หมายเหตุ: ชื่อหน้าจอ Console อ้างอิงเอกสารทางการปัจจุบัน (Tabular Workflow for Forecasting) ถ้าหน้าจอจริงต่างไว้ ให้ใช้ชื่อที่พบจริงและบันทึกกลับเข้าไฟล์นี้
แหล่งอ้างอิง: [Tabular Workflow for Forecasting](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/tabular-data/tabular-workflows/forecasting-train), [Codelab: AutoML forecasting](https://codelabs.developers.google.com/codelabs/automl-forecasting-with-vertex-ai)

## ก่อนเริ่ม (ผู้ใช้ทำ)

1. สร้าง/เลือก Google Cloud Project (จด Project ID ที่ปลอดภัย — ห้ามใส่ใน repo)
2. เปิด Billing และเปิด API: **Vertex AI API**, **Cloud Storage**, (แนะนำ) **BigQuery**
3. สิทธิ์ IAM ของบัญชีคุณ: อย่างน้อย `roles/aiplatform.user` + `roles/storage.objectAdmin` ใน bucket ที่ใช้

## 1) อัปโหลด Dataset

- ไฟล์: `data/vertex/pm25_daily_vertex.csv` → สร้าง Cloud Storage bucket (region แนะนำ `asia-southeast1`) แล้วอัปโหลด
- Console: Vertex AI → **Datasets** → Create → ประเภท **Tabular** → เป้าหมาย **Forecasting** → ชี้ไปที่ CSV ใน bucket

## 2) ตั้งค่า Forecasting (ค่าที่แนะนำ)

| ช่องตั้งค่า | ค่า |
|---|---|
| Target column | `pm25` |
| Time column | `timestamp` |
| Time series identifier | `location_id` |
| Available columns อื่น | `province`, `latitude`, `longitude` (attribute) — **ไม่มี weather** (ดู Data Quality Report) |
| Data frequency | **Daily (D)** |
| Forecast horizon | **3** (วัน) |
| Context window | ค่า default ของ workflow หรือ ≥ 28 วัน |
| Data split | **Time-based (chronological)** — กำหนดเองตามแผน: Test = 2026-07-01→2026-09-30 ห้าม Random split |
| Budget | เริ่มด้วย 1–3 node-hours ต่อรอบทดลอง |

## 3) Train → Evaluate → Batch Prediction

1. Train (Tabular Workflow for Forecasting) — จด **Training Pipeline ID / Model ID / Region** (ไม่มี Secret ในค่าเหล่านี้)
2. หน้า Evaluate: บันทึกค่า metrics ที่ Vertex ให้ **ต่อ horizon** — เทียบกับ baseline ใน `data/vertex/PHASE2_BASELINES.md` (เกณฑ์: ต้องชนะ persistence MAE 1.99/2.73/… จึงจะเปิดใช้จริง)
3. **Batch Prediction** (แนะนำแทน Endpoint — ดูเหตุผลด้านล่าง): source = สร้าง CSV ของวันอนาคต 3 วันต่อสถานี (หรือให้ workflow ทำ future prediction ตาม horizon), destination = Cloud Storage JSONL
4. ดาวน์โหลดไฟล์ผลมาเป็น `data/vertex/batch_predictions.jsonl` แล้วรัน:
   ```bash
   cd admin-app
   node scripts/vertex-import-batch-predictions.mjs --file ../data/vertex/batch_predictions.jsonl --model <model-display-name>
   ```
   สคริปต์จะ upsert เข้าตาราง `pm25_forecast_daily` (ต้องรัน migration `20261002090000_create_pm25_forecast_daily.sql` ใน Supabase ก่อน) — จากนั้น `/api/air-quality/dashboard` จะใช้ผล Vertex อัตโนมัติ พร้อมสลับกลับเป็น baseline ถ้าผลหาย/หมดอายุ

## Phase 5 — เลือก Batch หรือ Endpoint

**เลือก Batch Prediction** เพราะ:
- ข้อมูลอัปเดตวันละครั้ง (ingest cron 03:15) — ไม่ต้องตอบทันทีรายคำขอ
- ไม่มีค่า Endpoint เหลื่อม (online endpoint คิดเงินตาม node ชั่วโมงที่เปิดค้าง ขั้นต่ำ ~US$70–180/เดือน)
- ผลเก็บใน Supabase ตรวจย้อนได้ (model_version, updated_at)
- Rollback ง่าย: ลบ/ไม่ import ผล → ระบบกลับไป baseline อัตโนมัติ

ใช้ Online Endpoint เฉพาะเมื่ออนาคตต้องคำนวณสดรายคำขอ — ต้องผ่านการตรวจค่าใช้จ่ายก่อน (Phase 9)
