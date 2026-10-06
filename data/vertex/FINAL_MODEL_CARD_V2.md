# Model Card — RiskCare PM2.5 Forecast (ฉบับแก้ไข v2.0)

**เวอร์ชันเอกสาร:** v2.0 · **วันที่:** 2026-10-06 · **แทนที่:** ผลสรุปเดิมก่อน Phase 34 · **หลักฐาน:** `data/vertex/phase34_results.json` (commit `38ceeac`)

## 1. Model name / version

- **Production model:** `ml-local-v3.0` — Ridge blend50 (ML×persistence) ต่อ horizon, artifact `notebooks/pm25_model_production.joblib` (3.23 MB)
- **Fallback:** `baseline-pers-ma7blend-v1` — 0.7×persistence + 0.3×MA7 (ใช้เมื่อ ML rows stale หรือไม่มี)
- **Validated champion (Phase 34):** **persistence** — ดีที่สุดใน rolling-origin validation
- **Best ML:** pers_ma7blend @±3 = 49.6% (แพ้ persistence นัยสำคัญ, CI95 [−1.7, −0.1]) — MAE ต่ำสุด ensemble_pers_ml 4.47 (ต่าง 0.02 จาก persistence ไม่มีนัยสำคัญ)

## 2. Input / features

- **Input:** PM2.5 รายวันต่อสถานี (OpenAQ/Air4Thai, 33 สถานี กรุงเทพฯ, 24,765 แถว 2023-09→2026-09) + weather ณ origin (Open-Meteo archive: temp/rh/wind/rain) + spatial lag (ค่าเฉลี่ยสถานีอื่น ณ origin)
- **Features:** lag 1–7 วัน, rolling mean/std 3/7 วัน (shift(1)), dow, month, is_high_season — รวม 20 features
- **Hotspot:** ไม่มีข้อมูล ไม่รวม

## 3. Horizons

- รายงานหลัก: **h=1d** (h=2,3d สำหรับ AQI-category) · production publish: h1/h2/h3 วัน

## 4. Training command

```bash
# production (offline, Python 3.11)
python notebooks/train_production.py     # → pm25_model_production.joblib (ml-local-v3.0)
python notebooks/publish_forecasts.py    # → upsert pm25_forecast_daily (99 แถว/33 สถานี/รอบ)
# evaluation (Phase 34 — สร้างผลทั้งหมดในเอกสารนี้)
python notebooks/phase34_push.py         # → data/vertex/phase34_results.json
```

## 5. Data source / time split

- **Source:** OpenAQ v3 daily (`air_quality_daily` / `pm25_daily_vertex.csv`), weather = Open-Meteo Archive API (public, no key)
- **Split:** rolling-origin 6 folds (origins ไตรมาส 2025-01→2026-04, test 90 วัน/ฟอลด์) สำหรับเลือกโมเดล · **holdout ≥ 2026-08-15 ใช้รายงานเท่านั้น** · ไม่มี random split

## 6. Metrics (h=1d)

| Period | Model | ±2 | ±3 | ±4 | ±5 | MAE | N |
|---|---|---:|---:|---:|---:|---:|---:|
| CV all-season | persistence | 37.4 | **50.5** | 60.8 | 68.9 | 4.49 | 11,281 |
| CV all-season | pers_ma7blend | 36.0 | 49.6 | 59.9 | 67.6 | 4.51 | 11,281 |
| CV high-season | persistence | 23.7 | 33.8 | 43.3 | 52.0 | 6.29 | 5,215 |
| CV normal-season | persistence | 49.2 | 64.9 | 75.9 | 83.4 | 2.94 | 6,066 |
| Holdout | persistence | 63.2 | 79.1 | 87.6 | 92.5 | 2.10 | 1,198 |

AQI-category (US AQI 5 ระดับ, holdout): ML exact 82.4/79.4/77.4% และ **±1 ระดับ 98.9/98.9/98.5%** ที่ h=1/2/3d (persistence: exact 85.9/81.6/77.4%) — **เป็น metric หมวด AQI ต่างชนิดจาก PM2.5 ±µg/m³**

## 7. Bootstrap method

Station-month block bootstrap (แถวถูกจัดกลุ่มตาม station×fold×month, สุ่มกลุ่มแทนที่ 1,000 ครั้ง, seed=42) แบบ **row-level paired** ตรวจด้วย assert ลำดับแถว + target เท่ากันระหว่างโมเดล · ไม่ใช้ `pivot_table(aggfunc="first")` (แนวทางเก่าที่ตัดข้อมูลจนสรุปผิด — แก้แล้วใน Phase 34)

## 8. Leakage status

PASS ทั้งหมด: target = ค่าวัดถัดไปจริง (assert), features ≤ origin (shift(1)+), weather ณ origin เท่านั้น, holdout ไม่ถูกใช้เลือกโมเดล, monotonicity ±2≤±3≤±4≤±5 ผ่านทุกชุด

## 9. ข้อจำกัดสำคัญ

- **ฤดูฝุ่นสูง (ธ.ค.–มี.ค.):** ±3 ตกเหลือ 33.8% (N=5,215) — ตัวเลขฤดูเงียบ/holdout ใช้แทนทั้งปีไม่ได้
- **±3 @87–90% ยังไม่สำเร็จ** — all-season 50.5% · ฝุ่นสูง 33.8% · holdout 79.1%
- ข้อมูลรายวันเพดานต่ำ: median |Δ| 1 วัน ≈ 3 µg/m³
- กรุงเทพฯ เท่านั้น · weather ณ origin (ยังไม่มี forecast archive) · hotspot ไม่มี
- ⚠️ **ห้ามใช้ผล h=1 100% จาก hourly ML เป็นหลักฐาน real-hourly** — เป็น daily-to-hourly upsample artifact
- **โมเดลทดลอง (Ridge/HGB/residual/ensemble) ยังไม่พร้อม deploy** — ทุกตัวแพ้ persistence นัยสำคัญ

## 10. Missing-data fallback

ML rows stale (วันทำนาย ≤ ค่าวัดล่าสุด) หรือตารางว่าง → API สลับ `baseline-pers-ma7blend-v1` อัตโนมัติ + `modelVersion` ถูกต้องทุกแถว (ตรวจจาก API จริง 2026-10-06)

## 11. Monitoring

- API: `modelVersion`/`dataType`/`observedThrough`/`forecastThrough` ทุก response · freshness guard ฝั่ง backend
- publish_log.txt ต่อท้ายทุกรอบ (สถานะ live_ok/live_fail ต่อสถานี) · Task Scheduler 04:30 รายวัน
- แนะนำเพิ่ม (ยังไม่ทำ): drift monitor ต่อสถานี + QC noisy sensor (มี 4 sensor ที่รู้จัก)

## 12. Rollback

ลบแถวใน `pm25_forecast_daily` (หรือหยุด publish) → API กลับสู่ baseline อัตโนมัติ ไม่มี downtime · ไม่ต้องลบ endpoint (ไม่มี online endpoint — batch เท่านั้น)

## 13. Production safety status (2026-10-06)

`ml-local-v3.0` ไม่เปลี่ยน · ไม่มี deploy/publish/push ในเฟสนี้ · Backend/Frontend HTTP 200 · ไม่มี `.fit()` ในโค้ดเว็บ · scheduler/contract เดิม
