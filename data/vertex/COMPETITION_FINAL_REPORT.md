# RiskCare PM2.5 Forecast — Competition Final Report

**เวอร์ชัน:** v2.0 · **วันที่:** 2026-10-06 · **อ้างอิงผล:** Phase 34 (commit `38ceeac`, bootstrap แบบ row-level pairing ที่แก้ถูกต้องแล้ว) · **ผลดิบ:** `data/vertex/phase34_results.json`

**จุดยืนยันที่กรรมการ/ผู้ใช้เช็คเองได้:**
1. `python notebooks/phase34_push.py` → ตัวเลขในรายงานนี้ต้องตรงกับผลที่พิมพ์ออกทุกตัว
2. `git show 38ceeac --stat` → 2 ไฟล์ (สคริปต์ + JSON)
3. เรียก API จริง `GET /api/air-quality/dashboard?...&lat=13.763&lon=100.476` → ตรวจ field `modelVersion` และ `dataType` ต่อแถว

> **ข้อความบังคับ (1):** ระบบเทรนโมเดลด้วย Python 3.11 แบบ offline ไม่ได้เทรนในเว็บไซต์ เว็บไซต์เรียก Backend/API และแสดงผลเท่านั้น

> **ข้อความบังคับ (2):** ผลการประเมินพบว่า persistence เป็นโมเดลที่ดีที่สุดตาม rolling-origin validation โดยไม่มีโมเดล ML ใดชนะ persistence อย่างมีนัยสำคัญทางสถิติ

> **ข้อความบังคับ (3):** ค่า AQI ±1 ระดับที่ 98.5–98.9% เป็นความแม่นยำของหมวดหมู่ AQI ไม่ใช่ความแม่นยำของค่า PM2.5 ภายใน ±1 หรือ ±3 µg/m³

> **ข้อความบังคับ (4):** Accuracy@±3 µg/m³ ที่ระดับ 87–90% ยังไม่สำเร็จ โดย all-season อยู่ที่ 50.5% และฤดูฝุ่นสูงอยู่ที่ 33.8%

---

## 1. ปัญหาและเป้าหมาย

พยากรณ์ค่า PM2.5 รายวันล่วงหน้า 1–3 วันต่อสถานีวัดในกรุงเทพฯ (OpenAQ/Air4Thai) เพื่อแจ้งเตือนความเสี่ยงทางเดินหายใจในแอป RiskCare เป้าหมายที่ตั้งไว้เดิมคือ Accuracy@±2 และ @±3 µg/m³ ระดับ 87–90% ผลการวัดจริง (ตามหลักฐานในรายงานนี้) แสดงว่าเป้าหมายนั้น **เกินเพดานธรรมชาติของข้อมูลรายวัน** — ค่า PM2.5 เปลี่ยนเฉลี่ยวันละ ~3 µg/m³ (median) และครึ่งหนึ่งของวันเปลี่ยนเกิน ±3 จึงรายงานผลตามจริงพร้อมเมตริกที่เหมาะสมกว่า (หมวด AQI)

## 2. ระบบเทรนที่ไหน

เทรนด้วย **Python 3.11 บนเครื่องท้องถิ่น** ผ่านสคริปต์ใน `notebooks/` (`train_production.py` และสคริปต์ทดลอง) ไม่มีการเทรนในเว็บไซต์ทั้งสิ้น (ตรวจแล้ว: `grep .fit(` ใน `frontend/src` และ `admin-app/src` = **0 ผลลัพธ์**) ผลลัพธ์การเทรนคือไฟล์ `notebooks/pm25_model_production.joblib` (3.23 MB)

## 3. สถาปัตยกรรม

```
OpenAQ/Air4Thai ──▶ ingest cron (Supabase, 03:15)
                    │
Python 3.11 offline training (notebooks/train_production.py)
                    │  → pm25_model_production.joblib
publish_forecasts.py (Task Scheduler 04:30 ท้องถิ่น)
                    │  → Supabase ตาราง pm25_forecast_daily (batch, ไม่มี endpoint ออนไลน์)
Backend API (Next.js, พอร์ต 3000) — อ่านตาราง → fallback baseline เมื่อข้อมูล stale
                    │
Frontend (React/Vite, พอร์ต 5173) — เรียก API และแสดงผล + badge dataType เท่านั้น
```

- **Backend/API inference:** `admin-app/src/app/api/air-quality/dashboard/route.ts` + `airQualityVertexForecast.ts` อ่านคำทำนายจากตาราง `pm25_forecast_daily` (ไม่โหลด joblib ในเว็บ)
- **Frontend display:** `AirQualityTrend.jsx` แสดง badge ข้อมูลจริง/คาดการณ์/ประมาณการ/ไม่มีข้อมูล + `modelVersion` — ไม่มีโค้ดเทรน

## 4. Production model

**`ml-local-v3.0`** — Ridge blend50 (ML×persistence) ต่อ horizon h1/h2/h3 วัน, เทรนออฟไลน์, publish แบบ batch วันละครั้ง 04:30 ผ่าน Windows Task Scheduler
**สถานะการเสิร์ฟจริง ณ วันตรวจ (2026-10-06):** publish ล่าสุด = 2026-10-03 (99 แถว/33 สถานี) — ML rows เก่ากว่าค่าวัดล่าสุด ทำให้ **freshness guard ตัดแถว ML ออกและเสิร์ฟ fallback ตามดีไซน์** (ตรวจจาก API จริง: `modelVersion = baseline-pers-ma7blend-v1`, publish_log.txt ประทับเวลา 2026-10-03) — กลไกนี้ป้องกันการแสดงคำทำนายเก่าโดยไม่มีป้ายกำกับ

## 5. Baseline

- **persistence** — ทำนายด้วยค่าวัดล่าสุด ณ วัน origin (ค่ากลางของทุกการเปรียบเทียบ)
- **pers_ma7blend** (`baseline-pers-ma7blend-v1`) — 0.7×ค่าล่าสุด + 0.3×ค่าเฉลี่ย 7 วัน (fallback ที่ใช้จริงใน production)

## 6. โมเดลทดลอง (ยังไม่ deploy)

| โมเดล | ลักษณะ |
|---|---|
| direct_ridge / direct_hgb | Ridge / HistGradientBoosting พยากรณ์ target ตรงจาก features |
| residual_ridge / residual_hgb | พยากรณ์ "เศษ" = target − pm25[origin] แล้วบวกกลับ |
| station_ridge / station_hgb | เทรนต่อสถานี (fallback persistence เมื่อ train < 60 วัน) |
| ensemble_rh | ค่าเฉลี่ย direct Ridge + HGB |
| ensemble_pers_ml | ค่าเฉลี่ย persistence + HGB |

Features ทั้งหมด: lag 1–7 วัน, rolling mean/std 3/7 วัน (shift(1)), วันในสัปดาห์, เดือน, ฤดูฝุ่น, **weather ณ origin** (Open-Meteo archive: อุณหภูมิ/ความชื้น/ลม/ฝน — ไม่มี weather-forecast archive จึงใช้ค่า ณ origin ตามกฎห้าม leakage), **spatial lag** (ค่าเฉลี่ยสถานีอื่น ณ origin) · hotspot: **ไม่มีข้อมูลบนดิสก์ จึงไม่รวม**

## 7. วิธีแบ่งข้อมูล

- **Rolling-origin CV 6 folds** — origins ทุกไตรมาส 2025-01 → 2026-04, test window 90 วัน/ฟอลด์, train ขยายก่อน origin, **ทุก fold อยู่ก่อน holdout (2026-08-15)** จึงใช้เลือกโมเดลได้โดยไม่ปนเปื้อน
- **Holdout ≥ 2026-08-15 (N=1,198)** — ใช้รายงานหลังเลือกโมเดลเสร็จเท่านั้น ไม่ใช้ tune
- 33 สถานี (ทุกสถานี ≥30 วัน, ตั้งต้น 24,765 แถว 2023-09→2026-09)

## 8. Leakage checks (ผ่านทั้งหมด)

- target = ค่าวัดถัดไปจริง (ยืนยันด้วย assert เทียบ shift(-1); 10 แถวข้ามวันหาย — shift จัดการถูกต้อง ไม่ใช่วันปฏิทิน t+1)
- features ทั้งหมดมาจากข้อมูล ≤ origin (lags/rolling ใช้ shift(1)+, weather ณ origin, spatial lag ณ origin)
- weather ประเภท forecast ยังไม่มี archive → ใช้ weather ณ origin เท่านั้น (ไม่มีค่าอนาคตหลุดเข้า features)
- ไม่มีการสุ่ม split, ไม่มีการใช้ test เลือก hyperparameter

## 9. วิธีคำนวณ Accuracy@±2/±3/±4/±5

สัดส่วนตัวอย่างที่ |ค่าทำนาย − ค่าจริง| ≤ K µg/m³ (K = 2, 3, 4, 5) รายงานคู่กับ MAE · monotonicity ±2 ≤ ±3 ≤ ±4 ≤ ±5 ตรวจแล้วผ่านทุกโมเดลทุกชุดข้อมูล (assert ในสคริปต์)

## 10. ผล PM2.5 accuracy — h=1d, rolling-origin CV 6 folds (all-season, N=11,281)

| โมเดล | ±2 | ±3 | ±4 | ±5 | MAE |
|---|---:|---:|---:|---:|---:|
| **persistence (Best Overall)** | **37.4** | **50.5** | **60.8** | **68.9** | 4.49 |
| pers_ma7blend (Best ML/blend) | 36.0 | 49.6 | 59.9 | 67.6 | 4.51 |
| ensemble_pers_ml | 34.9 | 48.5 | 59.4 | 67.8 | **4.47** |
| residual_hgb | 32.6 | 46.6 | 57.7 | 66.8 | 4.55 |
| residual_ridge | 29.2 | 42.6 | 54.4 | 64.7 | 4.59 |
| direct_hgb | 26.6 | 38.7 | 49.4 | 58.2 | 5.72 |

Holdout ≥2026-08-15 (N=1,198): persistence ±3 = 79.1 / ±2 = 63.2 / MAE 2.10 · pers_ma7blend 78.3 / 59.0 / 2.16 · residual_hgb 72.8 / 55.1 / 2.35 — **±3 @87–90% ยังไม่สำเร็จทั้ง all-season และ holdout**

## 11. ผล AQI-category accuracy (US AQI 5 ระดับ ตามที่แอปใช้จริง, holdout)

| Horizon | ML exact | ML ±1 ระดับ | Persistence exact | Persistence ±1 ระดับ | N |
|---|---:|---:|---:|---:|---:|
| h=1d | 82.4% | **98.9%** | 85.9% | 98.7% | 1,195–1,198 |
| h=2d | 79.4% | **98.9%** | 81.6% | 98.6% | 1,169–1,171 |
| h=3d | 77.4% | **98.5%** | 77.4% | 98.6% | 1,142–1,144 |

## 12. ผล high-season vs normal-season (CV, h=1d, N จริง)

| ฤดู | persistence ±3 / MAE | pers_ma7blend ±3 / MAE | N |
|---|---|---|---:|
| ฝุ่นสูง (ธ.ค.–มี.ค.) | **33.8%** / 6.29 | 31.8% / 6.38 | 5,215 |
| ปกติ (เม.ย.–พ.ย.) | 64.9% / 2.94 | 65.0% / 2.89 | 6,066 |
| All-season | 50.5% / 4.49 | 49.6% / 4.51 | 11,281 |
| Holdout (ล่าสุด, ฤดูเงียบ) | 79.1% / 2.10 | 78.3% / 2.16 | 1,198 |

**ในฤดูฝุ่นสูง champion ฝั่ง ML/blend แพ้ persistence ด้วย** — ไม่มีมุมใดที่ ML ชนะอย่างมีนัยสำคัญ

## 13. Bootstrap 95% CI (station-month block, row-level paired, 1,000 resamples, pooled CV h=1d)

| โมเดล | Δ Accuracy@±3 vs persistence (CI95) | สรุป |
|---|---|---|
| pers_ma7blend | [−1.7, −0.1] | แพ้นัยสำคัญ |
| residual_hgb | [−5.1, −2.8] | แพ้นัยสำคัญ |
| ensemble_pers_ml | [−3.3, −0.9] | แพ้นัยสำคัญ |
| ensemble_rh | [−13.8, −9.8] | แพ้นัยสำคัญ |

ทุก CI ไม่คร่อม 0 และติดลบทั้งหมด — หมายเหตุความโปร่งใส: bootstrap รอบแรกเคยใช้ `pivot_table(aggfunc="first")` ที่ตัดข้อมูลจนชี้ผลผิด (เคยรายงาน "ชนะ") — พบและแก้เป็น row-level pairing ก่อนอ้างสิทธิ์ใด ๆ (commit `38ceeac` เป็นเวอร์ชันที่ถูกต้อง)

## 14. Best Overall

**persistence** — ชนะทุกเมตริกหลัก @±3 และ ±2 ใน rolling-origin validation อย่างมีนัยสำคัญ

## 15. Best ML

**pers_ma7blend** (`baseline-pers-ma7blend-v1`) — ดีที่สุดในกลุ่ม ML/blend @±3 (49.6%) แต่ยัง **แพ้ persistence อย่างมีนัยสำคัญ** [−1.7, −0.1] · MAE ต่ำสุดเป็นรายโมเดลคือ ensemble_pers_ml (4.47) ต่างจาก persistence 0.02 ไม่มีนัยสำคัญ

## 16. Fallback

เมื่อแถว ML ไม่สด (วันที่คำทำนาย ≤ ค่าวัดล่าสุด) หรือตารางไม่มีข้อมูล → API สลับไป **`baseline-pers-ma7blend-v1`** อัตโนมัติ พร้อมป้าย `modelVersion` ที่ถูกต้องทุกแถว (dataType `forecast`) — ตรวจจาก API จริงแล้วทำงานถูกต้อง

## 17. ข้อจำกัด

1. ข้อมูลรายวันมีเพดานธรรมชาติ: median |Δ| 1 วัน ≈ 3 µg/m³ → ±3@87–90% ทำไม่ได้ด้วยข้อมูลชุดนี้
2. 3 สถานีเท่านั้นที่มี hourly ยาว (409/406/395 วัน) — สถานีอื่นรายวันอย่างเดียว
3. ทุกสถานีอยู่กรุงเทพฯ — โมเดลใช้ได้เฉพาะโซนกรุงเทพฯ
4. weather เป็นค่า ณ origin (ยังไม่มี weather forecast archive ใน pipeline)
5. ผล holdout สูงกว่า all-season อย่างมากเพราะช่วง ส.ค.–ต.ค. เป็นฤดูเงียบ — **ห้ามสรุปจาก holdout เดียว**
6. h=1 100% จาก hourly ML คือ daily-to-hourly upsample artifact — **ไม่ใช่หลักฐาน real-hourly**
7. งานนี้เป็น offline evaluation — ไม่มีการเทรน/deploy ใหม่ในเฟสนี้

## 18. แผนพัฒนาต่อ (เรียงตามความคุ้มค่าที่ประเมิน)

| ลำดับ | แนวทาง | เหตุผลความคุ้มค่า |
|---:|---|---|
| 1 | **เพิ่มข้อมูล hourly จริงครบฤดูฝุ่น** | เพดาน ±3 ของรายวันคือข้อจำกัดรองถึงหลัก — hourly ยาวฤดูฝุ่นเปิดทางโมเดลรายชั่วโมง/วันรวมจริง (crawler พร้อมใช้แล้ว) |
| 2 | **AQI-category model แยกจาก PM2.5 regression** | ตัวชี้วัดที่ผ่านแล้ว (98.5–98.9% ±1 ระดับ) ตรงกับ alert ใน demo สุด ๆ — พัฒนาต่อให้เป็น classifier ตรงเป้า ใช้ทุนน้อย |
| 3 | **weather forecast ณ เวลาพยากรณ์จริง** (Protocol B) | ปัจจุบันใช้ weather ณ origin — forecast archive จะช่วยเฉพาะ horizon ยาว (ผล h=48–72 เคยดีขึ้น 8–9%) |
| 4 | **prediction interval / uncertainty** | เปลี่ยนเรื่องเล่าจาก "ค่าเดียว" เป็น "ช่วงน่าเชื่อ" — ปรับ UI น้อย มูลค่าความน่าเชื่อถือสูง |
| 5 | **monitoring drift + sensor quality** | จำเป็นก่อนขยายสถานี (มี noisy sensor 4 ตัวที่รู้จักแล้ว) |
| 6 | **station-specific weather mapping** | เดิม single-point (13.75, 100.5) — ผลต่อ accuracy จำกัดเพราะกรุงเทพฯ พื้นที่แคบ |
| 7 | **direct multi-horizon model** | Phase 34 แสดงว่าทางนี้ไม่ช่วย @±3 — ทำเมื่อมีข้อมูลใหม่ (ข้อ 1–3) แล้วเท่านั้น |

**สิ่งที่ระบบไม่มีและจะไม่ทำ:** สร้างข้อมูลจำลองแทนข้อมูลจริง · ลบ outlier เพื่อเพิ่ม metric · ปรับ threshold เพื่อให้ผ่านเป้า · ใช้ test set tune · อ้าง AQI ±1 ระดับเป็น PM2.5 accuracy

## 19. Production safety status

- โมเดล production: **`ml-local-v3.0` ไม่เปลี่ยน** · ไม่มี deploy/publish/push ในเฟสนี้
- Backend HTTP 200 · Frontend HTTP 200 (ตรวจ 2026-10-06) · API contract เดิม (`modelVersion`, `dataType`, `observedThrough`, `forecastThrough` ครบ)
- ไม่มี `.fit()` ใน frontend/backend · ไม่ได้รัน `publish_forecasts.py` · scheduler (04:30) ไม่เปลี่ยน
- Rollback: ลบแถวใน `pm25_forecast_daily` → API สลับ fallback อัตโนมัติ (ไม่มี downtime)

---

## ตารางสรุปแบบไม่ทำให้เข้าใจผิด (Metric / Model / Period แยกชัดเจน)

| Metric | Horizon | Model | Period | N | Result | Interpretation |
|---|---|---|---|---:|---:|---|
| PM2.5 Accuracy@±3 | 1d | persistence | all-season CV | 11,281 | 50.5% | ไม่ถึงเป้า 87–90% (Best Overall) |
| PM2.5 Accuracy@±3 | 1d | persistence | high-season CV | 5,215 | 33.8% | ต่ำลงมากในฤดูฝุ่น |
| PM2.5 Accuracy@±3 | 1d | persistence | holdout (ล่าสุด) | 1,198 | 79.1% | ฤดูเงียบเท่านั้น ห้ามสรุปรวม |
| PM2.5 Accuracy@±3 | 1d | pers_ma7blend (Best ML) | all-season CV | 11,281 | 49.6% | แพ้ persistence นัยสำคัญ |
| **AQI ±1 category** | 1d | ML (direct HGB) | holdout | 1,195 | 98.9% | **metric หมวด AQI — ไม่ใช่ PM2.5 ±µg/m³** |
| **AQI ±1 category** | 2d | ML (direct HGB) | holdout | 1,169 | 98.9% | **metric หมวด AQI — ไม่ใช่ PM2.5 ±µg/m³** |
| **AQI ±1 category** | 3d | ML (direct HGB) | holdout | 1,142 | 98.5% | **metric หมวด AQI — ไม่ใช่ PM2.5 ±µg/m³** |
| AQI exact category | 1d | persistence | holdout | 1,198 | 85.9% | แม่นหมวดตรง 5 ระดับ |
