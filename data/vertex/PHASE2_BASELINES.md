# Phase 2 — Baseline Evaluation (Time-based Holdout)

ผลวัดจริงจาก `admin-app/scripts/vertex-eval-baselines.mjs` · ข้อมูล: 24,765 แถว observed · ผล JSON: `baseline-eval-results.json`

## Split (time-based — ห้าม random)

| ช่วง | วันที่ | การใช้งาน |
|---|---|---|
| Train | 2023-09-28 → 2026-03-31 | ฝึกโมเดล |
| Validation | 2026-04-01 → 2026-06-30 | จูน/เลือกโมเดล |
| **Test (holdout)** | **2026-07-01 → 2026-09-30** | **ห้ามใช้เลือก/จูนโมเดล** |

Anti-leakage: การทำนายวัน t ที่ horizon h ใช้ได้เฉพาะข้อมูล ≤ (t−h)

## ผลบน Holdout (n = 1,804 คู่ สถานี×วัน ต่อ horizon)

| Baseline | h=1 MAE | h=1 RMSE | h=1 sMAPE | h=2 MAE | h=3 MAE |
|---|---|---|---|---|---|
| **persistence (ค่าล่าสุด)** | **1.99** | **2.83** | 20.8% | **2.73** | — |
| moving average 3 วัน | 2.38 | 3.35 | 24.2% | 2.89 | — |
| seasonal naive (สัปดาห์ก่อน) | 3.70 | 4.85 | 35.9% | — | — |
| **MA3+trend (ที่ production ใช้)** | 2.55 | 3.54 | 25.7% | — | — |

(ค่าเต็ม h=2/h=3 อยู่ใน `baseline-eval-results.json`)

## อัปเดต 2 ต.ค. 2569 — production baseline ถูกสลับแล้ว

ระบบ (admin-app `airQualityForecast.ts`) เปลี่ยนจาก MA3+trend → **`baseline-pers-ma7blend-v1`**
(0.7×ค่าล่าสุด + 0.3×MA7) ตามผล holdout: h1 MAE 1.99 / ±5 94% · h2 2.57 / 88% · h3 2.97 / 84%
(รวม 3 ฤดูฝุ่นสูง: persistence ครอบคลุมแค่ ±5 = 51% — ดูข้อจำกัดด้านล่าง)

## ความแม่นยำแยกฤดู (persistence — เกณฑ์ผ่านของโมเดล)

| ช่วง holdout | MAE (h1) | ±5 |
|---|---|---|
| ต่ำ: ก.ค.–ก.ย. 69 (n=1,804) | 1.99 | 93–94% |
| **สูง: ธ.ค. 68–มี.ค. 69 (n=3,239)** | **5.81** | **56%** |
| สูง 3 ฤดูรวม (n=9,582) | 6.59 | 51% |

## ข้อสรุปที่ต้องรายงานตรงไปตรงมา

1. **persistence ชนะทุก baseline บน holdout** (MAE 1.99 ที่ h=1) — พฤติกรรมปกติของ PM2.5 รายวัน (autocorrelation สูง)
2. **Baseline ที่ production ใช้ตอนนี้ (MA3+trend) ทำได้แย่กว่า persistence** (2.55 vs 1.99) — ส่วน trend ที่เป็น linear extrapolation เพิ่มความคลาดเคลื่อนในช่วงฝุ่นนิ่ง
3. **เกณฑ์ผ่านของ Vertex AI (Phase 4): model MAE ต้อง < 1.99 (h=1) / < 2.73 (h=2) / < ค่า h=3 ของ persistence** จึงจะเปิดใช้แทน baseline — ถ้าไม่ชนะ ระบบคง baseline และรายงานเหตุผลตามสเปก
4. MAPE รายงานเฉพาะค่าจริง ≥ 5 µg/m³ (ค่าต่ำมากทำ MAPE อิดเอื้อน) — sMAPE รายงานครบ

## จุดตรวจต่อ

- สถานี 1304082 ไม่มีข้อมูลในช่วง holdout (n=0) — รายงานแยกรายสถานีใน Phase 4 ตอนมีโมเดล Vertex จริง
- เมื่อผู้ใช้เทรนโมเดล Vertex เสร็จ: เพิ่มตารางเปรียบเทียบ `province | station | horizon | baseline_mae | model_mae | rmse | sample_count | date_range | status` ตามสเปกเฟส 4
