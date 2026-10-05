# Champion Model Scorecard — PM2.5 Forecast System
# Phase 27 · v1.0 · 4 ต.ค. 2569

> โมเดลถูกเทรนด้วย **Python 3.11 แบบ offline** ไม่ได้เทรนในเว็บไซต์
> เว็บไซต์เรียก Backend/API และแสดงผลเท่านั้น

> **Accuracy@±2 เป้าหมาย 87–90% ผ่านเฉพาะ horizon ที่มีหลักฐานรองรับ
> สำหรับ h=24–72 ยังไม่ผ่านเป้าหมาย**

---

## 1. เป้าหมาย Forecasting

| รายการ | ค่า |
|---|---|
| Metric หลัก | Accuracy@±2 µg/m³ |
| หน่วยวิเคราะห์ | station-hour |
| Horizons | 1 / 6 / 24 / 48 / 72 ชั่วโมง |
| ผู้ใช้งาน | เว็บ Dashboard (ผู้ป่วยระบบทางเดินหายใจ) |

## 2. แหล่งข้อมูล

| รายการ | Source | สิทธิ์ |
|---|---|---|
| PM2.5 hourly | OpenAQ v3 raw measurements (public, no key) | public |
| PM2.5 daily | Supabase air_quality_daily (ingest cron) | service_role |
| Weather | Open-Meteo Archive (public, no key) | public |

## 3. Data Profiling

| ช่วง | N | Mean | Std | สถานี | หมายเหตุ |
|---|---:|---:|---:|---:|---|
| pilot 2021 | 292 | 21.8 | 7.7 | 2 | ต่าง distribution |
| **2025-26 ปกติ** | 20,958 | 33.4 | 14.8 | 3 | รวมฝุ่นสูง |
| **ล่าสุด Q3-26** | 4,555 | 14.3 | 4.3 | 3 | สถานี 1304179 |

## 4. Leakage checks — ผ่านทั้งหมด ✓

- feature_timestamp ≤ origin ✓
- target_timestamp > origin ✓
- train < val < test ✓
- ไม่มี duplicate ✓
- preprocess fit จาก train ✓

## 5. Split

| ชุด | ช่วงเวลา |
|---|---|
| Train | ธ.ค. 67 → มิ.ย. 69 |
| Validation | ก.ค. 69 → ส.ค. 69 |
| **Holdout** | **ส.ค. 69 → ต.ค. 69** |

## 6. Baseline Comparison

| Model | h=1 ±2% | h=6 ±2% | h=24 ±2% | h=48 ±2% | h=72 ±2% |
|---|---:|---:|---:|---:|---:|
| persistence | **100%** | **93.3%** | **65.4%** | **59.9%** | **54.7%** |
| Ridge PM-only | — | — | — | 35.0% | 28.7% |
| Ridge+wx | — | — | 46.6% | 35.7% | 32.3% |
| HGB+wx | — | — | — | 58.9% (val) | 52.9% (val) |

*ค่า persistence = validation · ค่า Ridge/HGB = validation*

## 7. Holdout Results (ต.ค. 2569)

| Model | h=1 ±2% | h=6 ±2% | h=24 ±2% | h=48 ±2% | h=72 ±2% |
|---|---:|---:|---:|---:|---:|
| **persistence** | **100%** | **89.6%** | **50.8%** | **41.6%** | **34.0%** |
| Global Ridge PM-only | — | — | 28.0% | 28.0% | 21.7% |
| Global Ridge+wx | — | — | 46.6% | 37.7% | 29.0% |
| Global HGB+wx | — | — | — | 36.6% | 37.2% |

## 8. Champion per Horizon (validation-based)

| Horizon | Champion | Val MAE | Val ±2% | Holdout ±2% | Holdout MAE | ผ่าน 87%? |
|---|---|---:|---:|---:|---:|---|
| **1 ชม.** | **persistence** | **0.20** | **99.8%** | **100%** | **0.22** | ✅ |
| **6 ชม.** | **persistence** | **0.79** | **93.3%** | **89.6%** | **0.96** | ✅ |
| **24 ชม.** | **persistence** | **1.85** | **65.4%** | **50.8%** | **2.54** | ❌ |
| **48 ชม.** | **persistence** | **2.03** | **59.9%** | **41.6%** | **3.35** | ❌ |
| **72 ชม.** | **persistence** | **2.33** | **54.7%** | **34.0%** | **4.00** | ❌ |

**ข้อสรุป: persistence ชนะทุก horizon บน validation** — ไม่มี ML model ใดชนะอย่างสม่ำเสมอ

## 9. Fallback & Routing

| Station | h=24 Champion | h=48 Champion | h=72 Champion | Fallback | เหตุผล |
|---|---|---|---|---|---|
| 1304179 | persistence | persistence | persistence | pers-ma7blend | ML ไม่ชนะ val |
| 1304281 | persistence | persistence | persistence | pers-ma7blend | ML ไม่ชนะ val |
| 1304403 | persistence | persistence | persistence | pers-ma7blend | ML ไม่ชนะ val |
| อื่น ๆ | pers-ma7blend | pers-ma7blend | pers-ma7blend | pers-ma7blend | ข้อมูลสั้น/ไม่มี |

## 10. Uncertainty & Abstention Rule

| สถานการณ์ | การดำเนินการ |
|---|---|
| ข้อมูล < 3 วัน | ไม่แสดง forecast |
| ข้อมูล missing > 50% | แสดง `missing` ต่อช่วง |
| coverage < 12 ชม./วัน | ติดป้าย `low_coverage` |
| ฤดูฝุ่นสูง | แสดง warning "ความไม่แน่นอนสูง" |
| สถานีไม่รายงาน > 48 ชม. | fallback ไป global model |

## 11. Monitoring & Rollback

| เหตุการณ์ | การตอบสนอง |
|---|---|
| forecast หายจากตาราง | fallback baseline อัตโนมัติ |
| weather import ล้มเหลว | PM-only model |
| ผล MAE > 5 ต่อเนื่อง 3 วัน | alert + ตรวจสอบ |
| rollback | ลบแถว pm25_forecast_daily → baseline อัตโนมัติ |

## 12. ข้อจำกัด

1. 3 สถานี · กรุงเทพฯ เท่านั้น
2. Weather จุดเดียว (ไม่มี station-specific weather)
3. ฤดูฝุ่นสูง ±2 ต่ำกว่า 20%
4. ไม่มีข้อมูลรายชั่วโมงสถานีอื่นจังหวัด
5. hourly gaps ~10-23 ชม./วัน

---

*สร้าง 4 ต.ค. 2569 · ตรวจซ้ำแล้ว · ไม่มี data leakage · ไม่ push*
