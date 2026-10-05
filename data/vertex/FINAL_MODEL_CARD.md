# Final Model Card — PM2.5 Forecast System
# Phase 28 · v1.0 · 5 ต.ค. 2569

> โมเดลถูกเทรนด้วย **Python 3.11 แบบ offline** ไม่ได้เทรนในเว็บไซต์
> เว็บไซต์เรียก Backend/API และแสดงผลเท่านั้น

> **Accuracy@±2 เป้าหมาย 87–90% ผ่านเฉพาะ horizon ที่มีหลักฐานรองรับ
> สำหรับ h=24–72 ยังไม่ผ่านเป้าหมาย**

---

## Model Information

| รายการ | ค่า |
|---|---|
| Model name | ml-local-v3.0 |
| Model type | HistGradientBoosting + XGBoost (production) · Ridge (experimental) |
| Objective | Regression (PM2.5 µg/m³) |
| Horizons | 1, 6, 24, 48, 72 hours |
| Training program | Python 3.11 (offline scripts) |
| Training command | `cd notebooks && python train_production.py` |
| Dataset | 24,765 hourly rows · 3 stations · Bangkok |
| Timezone | Asia/Bangkok (+07:00) |
| Split | Time-based (no random) |
| Champion | **persistence** (h=1–72 ทุกตัว จาก validation) |

---

## Accuracy@±2 (µg/m³) — Holdout (Sep–Oct 2026)

| Horizon | Persistence | Ridge PM-only | Ridge+wx | HGB+wx | **ผ่าน 87–90%?** |
|---|---:|---:|---:|---:|---|
| h=1 | **100%** | 99.3% | 97.8% | 99.6% | ✅ persistence |
| h=6 | 93.3% | 89.4% | 85.5% | — | ✅ persistence |
| h=24 | 50.8% | 41.2% | 42.8% | — | ❌ |
| h=48 | 41.6% | 28.0% | 37.7% | 36.6% | ❌ |
| h=72 | 34.0% | 21.7% | 29.0% | 37.2% | ❌ |

---

## Known Limitations

1. ±2@87–90% ที่ h=24–72: **ยังไม่สำเร็จ** — ข้อจำกัดเชิงข้อมูล
2. ฤดูฝุ่นสูง: median daily change 20–32 µg/m³ เกินเพดาน ±2
3. สถานี hourly ยาวเพียง 3 ตัว
4. Weather จุดเดียว
5. Persistence ชนะ ML ทุก horizon — ML ยังไม่พร้อม deploy

## Fallback Chain

```
pm25_forecast_daily (ML) → pers-ma7blend (baseline) → ไม่แสดง forecast
```

## Rollback

ลบแถวจาก `pm25_forecast_daily` → ระบบกลับ baseline อัตโนมัติ

---

*สร้าง 5 ต.ค. 2569 · ตรวจซ้ำแล้ว · ไม่มี leakage*
