# Champion Forecast Strategy — PM2.5 Forecast System
# Phase 26 · v1.0 · 4 ต.ค. 2569

## สถาปัตยกรรม

> **ระบบเทรนโมเดลด้วย Python 3.11 แบบ offline ไม่ได้เทรนในเว็บไซต์**
> เว็บไซต์เรียก Backend/API และแสดงผลเท่านั้น
> **Production model ยังเป็น `ml-local-v3.0`**

| ขั้นตอน | โปรแกรม | ภาษา |
|---|---|---|
| Data ingestion | Supabase cron → dailyIngest.ts | TypeScript |
| Training (prod) | `notebooks/train_production.py` | Python 3.11 |
| Training (exp) | `notebooks/train_hourly_ml.py` · `train_hourly_weather.py` · `hgb_vs_ridge.py` | Python 3.11 |
| Model artifact | `notebooks/pm25_model_production.joblib` | Python binary |
| Publish | `notebooks/publish_forecasts.py` | Python 3.11 |
| Backend inference | `admin-app/src/app/api/air-quality/dashboard/route.ts` | TypeScript |
| Frontend display | `frontend/src/pages/AirQualityTrend.jsx` | JavaScript |

## คำสั่งที่ใช้จริง

```bash
# Train production
cd C:\Users\ACER\projectweb\notebooks && python train_production.py

# Publish forecasts
cd C:\Users\ACER\projectweb\notebooks && python publish_forecasts.py

# Train hourly experimental
cd C:\Users\ACER\projectweb\notebooks && python train_hourly_ml.py

# Run evaluation
cd C:\Users\ACER\projectweb\notebooks && python eval_accuracy_at_2.py

# Start backend
cd C:\Users\ACER\projectweb\admin-app && npm run dev

# Start frontend
cd C:\Users\ACER\projectweb\frontend && npm run dev
```

## Champion ต่อ Horizon

| Horizon | Champion | Basis | Acc@±2 | MAE | ผ่าน 87–90% |
|---|---|---|---:|---:|---|
| **1 ชม.** | persistence_1h | validation | 100.0% | 0.00 | ✅ |
| **6 ชม.** | Ridge+wx (w=0.0) | validation | 95.4% | 0.82 | ✅ |
| **24 ชม.** | **persistence** | validation + rolling-origin | **52.9%** | 2.41 | ❌ |
| **48 ชม.** | **persistence** | validation | 52.9% | 2.38 | ❌ |
| **72 ชม.** | **persistence** | validation | 53.6% | 2.32 | ❌ |

## กฎเลือก Champion

1. เลือกจาก validation MAE (ไม่ใช้ test)
2. ต้องชนะ persistence ใน rolling-origin ≥ 3/5 origins
3. หากไม่มีโมเดลชนะ → ใช้ persistence
4. Station-specific model เฉพาะเมื่อชนะ global ใน validation

## Fallback Strategy

```
ผล ML ใน pm25_forecast_daily (ถ้ามี) → modelVersion จากตาราง
    ↓ ไม่มี/หมดอายุ
baseline pers-ma7blend-v1 (fallback อัตโนมัติ)
    ↓ ข้อมูล < 3 วัน
ไม่แสดง forecast (แสดง "ยังไม่มีข้อมูลเพียงพอ")
```

## ข้อจำกัด

1. **h=24–72 ยังไม่ถึง 87–90% @±2** — persistence ดีที่สุดที่ ~53%
2. **ฤดูฝุ่นสูง** — median daily change 20–32 µg/m³ เกินเพดาน ±2
3. **สถานีข้อมูลยาวเพียง 3 ตัว** — ไม่พอสำหรับ global model
4. **Weather จุดเดียว** — ควรมี station-specific weather mapping
5. **CI กว้าง** — bootstrap CI ของ wx model กว้างกว่า pm_only

## คำตอบ: เว็บ train model หรือไม่

**ไม่** — เว็บไซต์ไม่มีโค้ด train model ทั้ง frontend และ backend
Training ทำผ่าน Python scripts แบบ offline ในเครื่องเท่านั้น
Backend อ่านผลจากตาราง Supabase `pm25_forecast_daily` เท่านั้น

## วิธีทำซ้ำ

```bash
# 1. Crawl hourly data
cd C:\Users\ACER\projectweb\notebooks
python fetch_hourly_batches.py --stations 1304179,1304281,1304403 --start 2024-12-01 --end 2026-10-03 --batch-days 30

# 2. Export dataset
python vertex-export-dataset.mjs

# 3. Evaluate baselines
python vertex-eval-baselines.mjs

# 4. Train ML (experimental)
python train_hourly_ml.py

# 5. Publish forecasts
python publish_forecasts.py --file ../data/vertex/batch_predictions.jsonl --model ml-local-v3.0
```

---

*รายงานสร้างจากผลการทดลองจริงทั้งหมด · ห้าม deploy จนกว่าจะผ่านเกณฑ์*
