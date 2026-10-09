# Model Card — RiskCare PM2.5 Forecast (ฉบับแก้ไข v2.1)

**เวอร์ชันเอกสาร:** v2.1 · **วันที่:** 2026-10-07 · **แทนที่:** v2.0 (ยังอ้าง production เป็น v3.0 ซึ่งล้าสมัย) · **หลักฐาน:** `data/vertex/round4_pm5_push.json`, `round5_hourly_ml_deep.json`, `round5b_all_season.json`, `round6_daily_deep.json`

## 1. Model name / version (ที่ deploy จริง ณ 2026-10-07)

- **รายวัน:** `ml-local-v4.0` — เลือกสูตรต่อ horizon ตาม rolling-origin CV:
  - **h=1 (24 ชม.): residual HGB** (deep features) + persistence — โมเดลแรกที่ชนะ persistence ทุก metric (CV ±5 68.9% / ±3 51.8% / MAE 4.37)
  - **h=2–3 (48–72 ชม.): w05 blend** (0.5×ค่าล่าสุด + 0.5×MA7) — CV-best (±5 ทั้งฤดู 57.0/53.0% · ช่วงล่าสุด 85.1/80.7%)
  - artifact: `notebooks/pm25_model_v4_residual.joblib` (792 KB, อยู่ใน repo)
- **รายชั่วโมง:** `hourly-persistence-v1` — หน้า /hourly-forecast (ดูหัวข้อ 6)
- **Fallback:** `baseline-pers-ma7blend-w05-v1` — เมื่อแถว ML stale/หาย (API สลับอัตโนมัติ)
- **Rollback artifact:** `pm25_model_production.joblib` (v3.0, 3.39 MB, อยู่ใน repo)

## 2. Validated champion / Best ML

- **Validated champion @±3 (daily, all-season CV):** persistence 50.5% — แต่ที่ h=1 **residual HGB แซงแล้ว (51.8%)** (round6) จึง deploy ที่ h=1
- **Best ML 48–72 ชม.:** w05 blend (ยังชนะ ML ตัวอื่น)
- **Hourly:** residual HGB ชนะ persistence ในฤดูฝุ่น +3.0–3.3 จุด @±3 (h=4–6 ชม., round5b) — ยังไม่ deploy (ต้อง inference path แยก)

## 3. Input / features

33 features: lags 1–14 วัน, rolling mean/std 3/7/14/30, min/max 7/14, ROC 1/7, momentum 3-7, **spatial lag** (ค่าเฉลี่ยสถานีอื่น ณ origin), dow, month, is_high_season — ทุกตัวใช้ข้อมูล ≤ origin เท่านั้น

## 4. Horizons

รายวัน h=1/2/3 (เสิร์ฟผ่าน `pm25_forecast_daily`) · รายชั่วโมง 1/2/3 ชม. (คำนวณสด ณ request)

## 5. Training command (Python 3.11 offline — ไม่ได้เทรนในเว็บ)

```bash
python notebooks/train_v4_residual.py    # → pm25_model_v4_residual.joblib (ml-local-v4.0)
python notebooks/publish_forecasts.py    # → upsert pm25_forecast_daily 99 แถว/33 สถานี (scheduler 04:30 รายวัน)
```

## 6. Metrics ล่าสุด (สรุปจากรอบ 4–6)

**รายวัน (deploy แล้ว):**

| Horizon | โมเดลใน v4.0 | ±5 ช่วงล่าสุด | ±5 ทั้งฤดู (CV) | ±3 ทั้งฤดู |
|---|---|---:|---:|---:|
| 24 ชม. | residual HGB | 92.7% | 68.9% | 51.8% |
| 48 ชม. | w05 blend | 85.1% | 57.0% | 38.9% |
| 72 ชม. | w05 blend | 80.7% | 53.0% | 36.6% |

**รายชั่วโมง (โหมด /hourly-forecast, `hourly-persistence-v1`):**

| Horizon | ±2 | ±3 | MAE | N | หมายเหตุ |
|---|---:|---:|---:|---:|---|
| 1 ชม. | 99.2% | 99.8% | 0.37 | 27,929 | ทั้ง dataset ทุกฤดู |
| 2 ชม. | 95.0% | 98.4% | 0.67 | 27,865 | 〃 |
| 3 ชม. | 89.0% | 95.4% | 0.96 | 27,835 | 〃 |
| 4–6 ชม. | 90.7–97.3% | 98.0–99.8% | — | ~3,400 | ช่วงล่าสุด (holdout); ±3 ผ่าน 87-90% ถึง h=4 ทุกฤดู (93.6%) |

**คำเตือนเดิมยังบังคับ:** AQI ±1 ระดับ 98.5–98.9% เป็น metric หมวด AQI ไม่ใช่ PM2.5 ±µg/m³ · ±3 @87–90% รายวัน all-season ยังไม่สำเร็จ (50–52%) · h=1 100% จาก hourly ML เก่า = upsample artifact

## 7. Time split / bootstrap / leakage

Rolling-origin CV 6 folds (2025-01→2026-06) สำหรับเลือกโมเดล · holdout ≥2026-08-15 ใช้รายงานเท่านั้น · station-month row-level paired bootstrap (Phase 34) · leakage asserts ผ่านทุกรอบ (features ≤ origin, target = ค่าวัดถัดไปจริง, ไม่มี fillna(0) — บั๊กชนิดนี้เคยทำให้ ML หน้าตาแย่และถูกแก้ใน round5)

## 8. ข้อจำกัด

- กรุงเทพฯ เท่านั้น · hourly สถานีประวัติยาว 3 ตัว · weather ณ origin (ยังไม่มี forecast archive ใน pipeline — Protocol B ทดลองแล้วไม่ช่วย) · hotspot ไม่มีข้อมูล
- ฤดูฝุ่น ±5 รายวันอยู่ 52–57% (CV) — เพดานข้อมูลรายวัน
- residual HGB เป็น Python joblib — ทำงานผ่าน precompute ใน publish (ไม่โหลดใน Next.js)

## 9. Fallback / monitoring / rollback

- ML stale → API สลับ `baseline-pers-ma7blend-w05-v1` อัตโนมัติ + modelVersion ถูกต้องทุกแถว
- Monitoring: `modelVersion`/`dataType`/`observedThrough`/`forecastThrough` ทุก response · publish_log.txt ต่อรอบ
- Rollback: ลบแถว v4 ในตาราง → fallback ทันที ไม่มี downtime · กลับไป v3.0 = รัน publish เดิมกับ joblib v3

## 10. Production safety status (2026-10-07)

`ml-local-v4.0` เสิร์ฟจริง (ตรวจ API 2 พิกัด ครบ 3 วัน) · ไม่มี `.fit()` ในโค้ดเว็บ · backend/frontend HTTP 200 · commits สะสมยังไม่ push
