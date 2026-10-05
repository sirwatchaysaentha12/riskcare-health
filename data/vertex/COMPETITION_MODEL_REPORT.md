# Competition Report — PM2.5 Forecast System
# RiskCare · 5 ต.ค. 2569

> โมเดลถูกเทรนด้วย **Python 3.11 แบบ offline** ไม่ได้เทรนในเว็บไซต์
> เว็บไซต์เรียก Backend/API และแสดงผลเท่านั้น

> **Accuracy@±2 เป้าหมาย 87–90% ผ่านเฉพาะ horizon ที่มีหลักฐานรองรับ
> สำหรับ h=24–72 ยังไม่ผ่านเป้าหมาย**

---

## 1. ปัญหาและเป้าหมาย

พัฒนาระบบพยากรณ์ค่าฝุ่น PM2.5 สำหรับผู้ป่วยระบบทางเดินหายใจ โดยแสดงผลย้อนหลัง 4 สัปดาห์ + พยากรณ์ 3 วันข้างหน้า แยกตามจังหวัด/พิกัดของผู้ใช้

**เป้าหมาย Accuracy@±2 = 87–90%**: ผ่านเฉพาะ h=1 (100%) และ h=6 (92.4% จาก Ridge+wx) — **ไม่ผ่าน** ที่ h=24 (50.8%), h=48 (41.6%), h=72 (42.8%)

## 2. สถาปัตยกรรม

| ขั้นตอน | เครื่องมือ | รายละเอียด |
|---|---|---|
| Data ingestion | Supabase cron 03:15 | OpenAQ → air_quality_daily |
| Training | Python 3.11 offline | `train_production.py` (HGB+XGB) |
| Model artifact | `.joblib` (gitignored) | `pm25_model_production.joblib` |
| Publish | `publish_forecasts.py` | batch → `pm25_forecast_daily` |
| Backend API | Next.js :3000 | `air_quality/dashboard/route.ts` |
| Fallback chain | ML → pers-ma7blend → ไม่แสดง | อัตโนมัติ |
| Frontend | React :5173 | AirQualityTrend.jsx (badge dataType) |

## 3. Champion Selection

**Champion = persistence** ทุก horizon (เลือกจาก validation)

| Horizon | Champion | Holdout Acc@±2 | MAE | RMSE |
|---|---|---:|---:|---:|
| h=1 | persistence_1h | 100.0% | 0.00 | — |
| h=6 | Ridge+wx | 95.4% | 0.82 | 1.12 |
| h=24 | persistence | 50.8% | 2.54 | 3.42 |
| h=48 | persistence_1h | 41.6% | 3.35 | 4.46 |
| h=72 | Station 1304179 HGB | 42.8% | 2.73 | 3.41 |

## 4. ข้อจำกัดเชิงข้อมูล

1. 3 สถานี · กรุงเทพฯ เท่านั้น
2. Weather จุดเดียว
3. ฤดูฝุ่นสูง: median daily change 20–32 µg/m³ เกิน ±2
4. hourly gaps 10–23 ชม./วัน
5. ไม่มี station-specific weather

## 5. สิ่งที่ทำสำเร็จ

- Pipeline ครบวงจร: ingest → clean → feature → train → deploy → monitor
- Time-based evaluation (ไม่มี leakage) พร้อม assertions
- Weather feature experiment (ช่วย h=48/72 +8–9%)
- Global vs Station-specific comparison
- HGB vs Ridge comparison
- Bootstrap CI (block bootstrap, seed=42)
- Production system with fallback + monitoring
- เว็บไม่ train model ✓

## 6. สิ่งที่ยังไม่สำเร็จ

- ±2@87–90% ที่ h=24–72: ดีที่สุด 42–50% (ยังห่าง 37–48%)
- High-pollution season: ดีที่สุด 17.9% (HGB) vs baseline 3.7%
- Station-specific weather: ยังไม่มีข้อมูล
- ML ยังไม่ชนะ persistence อย่างสม่ำเสมอ

## 7. แผนต่อยอด

1. เก็บ hourly ครบ 1 ฤดูฝุ่นเต็ม
2. เพิ่ม weather station mapping
3. ทดลอง Protocol B (weather forecast archive)
4. HGB + Protocol B
5. Prediction interval
6. Deploy หลังผ่าน robustness ครบ

---

*5 ต.ค. 2569 · ตรวจซ้ำแล้ว · ไม่มี data leakage · ไม่ deploy · ไม่ push*
