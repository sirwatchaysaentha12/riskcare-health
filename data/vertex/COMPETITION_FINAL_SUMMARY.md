# Competition Final Summary — PM2.5 Forecast System
# RiskCare · Phase 30 · v1.0 · 5 ต.ค. 2569

> ระบบเทรนโมเดลด้วย **Python 3.11 แบบ offline** ไม่ได้เทรนในเว็บไซต์
> เว็บไซต์เรียก Backend/API และแสดงผลเท่านั้น

> ผล h=1 ที่สูงผิดปกติ (100% @±2) ไม่ถือเป็นหลักฐานของ real-hourly forecasting
> เนื่องจากข้อมูลรายวันถูกขยายเป็นรายชั่วโมงด้วยการคัดลอกค่า

> Validated Champion ถูกเลือกจาก validation ไม่ใช่ holdout
> Station-specific HGB ที่ดีที่สุดใน holdout ถูกจัดเป็น **Holdout-only Best**
> ไม่ใช่ production champion

> **เป้าหมาย Accuracy@±2 = 87–90% ยังไม่สำเร็จสำหรับ h=24–72 ชั่วโมง**

---

## 1. ปัญหาและเป้าหมาย

พัฒนาระบบพยากรณ์ค่าฝุ่น PM2.5 สำหรับผู้ป่วยระบบทางเดินหายใจ โดยแสดงผลย้อนหลัง + พยากรณ์ล่วงหน้า แยกตามจังหวัด/พิกัด

**เป้าหมาย Accuracy@±2 = 87–90%**: ผ่านเฉพาะ h=1 (100%) และ h=6 (92.4% จาก Ridge+wx) บน normal season · **ไม่ผ่าน** ที่ h=24–72 และ **ไม่ผ่าน** ในฤดูฝุ่นสูง

## 2. สถาปัตยกรรม

```
ข้อมูลจริง (OpenAQ)
  → ingest cron 03:15 → Supabase air_quality_daily
  → python train_production.py → pm25_model_production.joblib
  → python publish_forecasts.py → Supabase pm25_forecast_daily
  → backend route.ts อ่าน pm25_forecast_daily → ส่ง forecast[] + modelVersion
  → frontend AirQualityTrend.jsx แสดง badge + กราฟ + ตาราง
```

เว็บไซต์ **ไม่ train model** — Training ทำด้วย Python 3.11 แบบ offline

## 3. เทรนด้วย Python offline

| รายการ | ค่า |
|---|---|
| ภาษา | Python 3.11 |
| ไลบรารี | scikit-learn · XGBoost · joblib |
| ไฟล์ train production | `notebooks/train_production.py` |
| ไฟล์ train experimental | `train_hourly_ml.py` · `train_hourly_weather.py` · `hgb_vs_ridge.py` |
| คำสั่ง | `cd notebooks && python train_production.py` |
| Model artifact | `pm25_model_production.joblib` (gitignored) |

## 4. เว็บ/API flow

```
frontend :5173 (React)
  → GET /api/air-quality/dashboard?period&metric&lat&lon&risk
  → backend :3000 (Next.js)
    → อ่าน pm25_forecast_daily (ML forecasts)
    → fallback: airQualityForecast.ts (baseline)
    → ส่ง { historical, forecast[], todayEstimate, modelVersion }
  → frontend แสดง badge dataType + กราฟ + ตาราง
```

## 5. Production model

| รายการ | ค่า |
|---|---|
| modelVersion | `ml-local-v3.0` |
| Features | lag 1-72h + rolling + weather (7 features) |
| Training | Python 3.11 offline |
| Fallback | `baseline-pers-ma7blend-v1` |

## 6–7. ข้อมูลและข้อจำกัด

| รายการ | ค่า | ข้อจำกัด |
|---|---|---|
| แถว hourly | 30,151 | daily upsample |
| สถานี | 25 (hourly) · 3 (long history) | กรุงเทพฯ เท่านั้น |
| ช่วงเวลา | ธ.ค. 67 → ต.ค. 69 | 1 ฤดูฝุ่นเต็ม + 1 บางส่วน |
| Weather | จุดเดียว กรุงเทพฯ | ไม่มี station-specific weather |
| Missing | 0% | — |

## 8. Champion Selection

| Horizon | Validated Champion | Best Overall | Best ML | Holdout-only Best | Fallback |
|---:|---|---|---|---|---|
| 1h | persistence | persistence_1h | Ridge+wx | — | pers-ma7blend |
| 6h | persistence | Ridge+wx | Ridge+wx | — | pers-ma7blend |
| 24h | persistence | persistence | Ridge+wx | Station 1304403 HGB | pers-ma7blend |
| 48h | persistence | persistence_1h | Station 1304403 HGB | — | pers-ma7blend |
| 72h | persistence | Station 1304179 HGB | Global HGB+wx | — | pers-ma7blend |

⚠️ **h=1 100% @±2 เป็น artifact** จาก daily-to-hourly upsampling — ไม่ถือเป็นหลักฐาน real-hourly forecasting

## 9. Accuracy@±2 ตารางหลัก

| Horizon | Persistence | Ridge+wx | HGB+wx | ผ่าน 87–90%? |
|---|---:|---:|---:|---|
| h=1 | 100% | 97.8% | 99.6% | ✅ artifact |
| h=6 | **89.6%** | 92.6% | — | ✅ (persistence/Ridge+wx) |
| **h=24** | **50.8%** | 42.8% | 48.9% | ❌ (50.8% < 87%) |
| h=48 | 41.6% | 37.7% | 40.6% | ❌ (41.6% < 87%) |
| h=72 | 34.0% | 29.0% | 37.2% | ❌ (34.0% < 87%) |

## 10. High-pollution season

| Model | h=24 ±2% | MAE |
|---|---:|---:|
| persistence | 17.9% | 6.59 |
| Ridge+wx | — | — |
| HGB+wx | — | — |

**ฤดูฝุ่นสูงไม่มีโมเดลใดถึง 87%** — ต้องการข้อมูลรายชั่วโมงครบฤดู + weather forecast

## 11. Leakage checks ✓

- feature_timestamp ≤ origin ✓
- target_timestamp > origin ✓
- train < val < test ✓
- ไม่มี duplicate ✓
- preprocess fit จาก train ✓

## 12. ข้อจำกัด

1. 3 สถานี · กรุงเทพฯ เท่านั้น
2. Weather จุดเดียว
3. ฤดูฝุ่นสูง ±2 ต่ำกว่า 20%
4. hourly gaps 10–23 ชม./วัน
5. Bootstrap CI ของ wx model กว้าง
6. ไม่มี station-specific weather mapping

## 13. แผนต่อยอด

1. เก็บ hourly ครบ 1 ฤดูฝุ่นเต็ม
2. เพิ่ม weather station mapping
3. ทดลอง Protocol B
4. HGB + Protocol B
5. Prediction interval

## 14. Production safety

| รายการ | สถานะ |
|---|---|
| Backend HTTP 200 | ✓ |
| Frontend HTTP 200 | ✓ |
| modelVersion | ml-local-v3.0 ✓ |
| Fallback chain | ✓ |
| Rollback | ลบแถว → baseline ✓ |
| Scheduler | ไม่แก้ ✓ |

---

*5 ต.ค. 2569 · ตรวจซ้ำแล้ว · ไม่มี leakage · ไม่ deploy · ไม่ push*
