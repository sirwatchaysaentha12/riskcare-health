# PM2.5 Pipeline Runbook

> ปรับปรุงล่าสุด: 2026-10-09  
> รุ่นโมเดล: `ml-local-v4.0` (pm25_model_v4_residual.joblib)  
> **ห้าม deploy v2.7 | ห้ามเทรนใหม่โดยไม่ผ่าน shadow evaluation**

---

## ลำดับ Fallback

```
PCD/Air4Thai (primary, ไม่ต้อง key)
    ↓ ล้ม
OpenAQ (เฉพาะถ้า OPENAQ_API_KEY ใช้ได้)
    ↓ ล้ม / 401 / ไม่มี key
ข้อมูลจาก Supabase air_quality_daily เท่านั้น
    → pipeline_status = degraded (ไม่ล้ม เว็บยังทำงาน)
```

**กฎ**: `OPENAQ_AUTH_FAILED` → ข้ามขั้น OpenAQ เงียบๆ, ไม่แสดง traceback, `status=degraded`

---

## รัน Pipeline ปกติ

```powershell
# ใน PowerShell
cd C:\Users\ACER\projectweb
.venv-pm25-forecast\Scripts\Activate.ps1
python notebooks\publish_forecasts.py
```

ผลที่ควรเห็น:
```
โหลดข้อมูลจริง: N แถว
โหลดโมเดล: ml-local-v4.0
publish แล้ว: M แถว forecast · K สถานี · ... · pipeline_status=ok
[pipeline] บันทึก pipeline_runs: ok
```

ถ้า OpenAQ ล้ม:
```
[pipeline] OPENAQ_AUTH_FAILED (HTTP 401) — ข้ามขั้น OpenAQ, status=degraded
...
pipeline_status=degraded
```
→ **ปกติ — เว็บยังทำงาน**

---

## SQL Migrations ที่ต้องรัน (ผู้ใช้รันเอง)

รันตามลำดับใน **Supabase SQL Editor** (ใช้ service role):

| ลำดับ | ไฟล์ | คำอธิบาย |
|--------|------|-----------|
| 1 | `admin-app/supabase/migrations/20261007120000_create_pm25_forecast_province.sql` | ตาราง `pm25_forecast` + `pipeline_runs` |
| 2 | `admin-app/supabase/migrations/20261009160000_pm25_province_pipeline_guards.sql` | ตาราง `province_stations` + accuracy |
| 3 | `admin-app/supabase/migrations/20261009180000_pipeline_runs_and_shadow_forecasts.sql` | ขยาย `pipeline_runs` + ตาราง `shadow_forecasts` ใหม่ |

**ข้อควรระวัง**: ไฟล์ทุกไฟล์ใช้ `CREATE TABLE IF NOT EXISTS` และ `ADD COLUMN IF NOT EXISTS` — รันซ้ำได้ปลอดภัย

---

## Health Check รายวัน

Pipeline จะรายงานถ้าข้อมูลเก่าเกิน 2 วัน ผ่าน field `state='stale'` ใน API  
ตรวจด้วยมือ:

```sql
-- ดู pipeline run ล่าสุด
SELECT run_date, status, finished_at, detail->>'pipelineStatus' as pipeline_status
FROM pipeline_runs ORDER BY started_at DESC LIMIT 5;

-- ตรวจข้อมูลเก่า (ควรมีข้อมูลภายใน 2 วัน)
SELECT max(updated_at) as latest, now() - max(updated_at) as age
FROM pm25_forecast_daily;
```

**เตือน** ถ้า `age > 2 days` → รัน pipeline ใหม่

---

## 4 สถานะของเว็บ

| state | ความหมาย | สิ่งที่แสดง |
|-------|-----------|------------|
| `ok` | พยากรณ์ใหม่ (< 2 วัน) | ค่าพยากรณ์ + horizon ที่พร้อม |
| `stale` | พยากรณ์เก่า | บอกอายุ (X วันที่แล้ว) + ปุ่มลองใหม่ |
| `unsupported` | จังหวัดยังไม่รองรับ | ค่าจริงปัจจุบันจาก PCD + trend |
| `error` | ผิดพลาด | ข้อความ + ปุ่มลองใหม่ |

**ห้ามการ์ดว่าง**: ทุกสถานะต้องแสดงข้อมูลบางอย่าง

---

## Shadow Evaluation (โหมดเงา)

- เก็บพยากรณ์ทุกวันลง `shadow_forecasts` (issued_date, target_date, horizon, pm25_predicted)
- วันถัดไป: อัปเดต `pm25_actual` เมื่อรู้ค่าจริง
- คำนวณ MAE เทียบ persistence baseline ("พรุ่งนี้ = วันนี้")
- **แสดงพยากรณ์เฉพาะ horizon ที่ชนะ baseline ≥ 14 วันต่อเนื่อง**
- ที่เหลือแสดง "ยังไม่พร้อม" + trend 7 วันจากข้อมูลจริง

---

## ตัวเลือกเสริม (ยังไม่ deploy)

**CAMS ผ่าน Open-Meteo**: `getGriddedPm25()` ใน `admin-app/src/lib/griddedPm25.ts`  
- ครอบคลุมทั่วโลก ~45 กม. 5 วัน  
- ต้องใส่ attribution: "Data source: CAMS / Open-Meteo"  
- **ประเมินในโหมดเงาก่อน** เทียบกับสถานีจริงของไทย  
- ตัดสินใจ deploy เมื่อ MAE ชนะ baseline ≥ 14 วัน

---

## ป้องกัน Secret

1. `pre-commit` hook อยู่ที่ `.github/hooks/pre-commit`  
   ติดตั้ง: `copy .github\hooks\pre-commit .git\hooks\pre-commit`
2. `.gitignore` ครอบคลุม `.env*`, `AutogluonModels/`, log files, CSV ขนาดใหญ่
3. ห้าม commit `.env.local` — ใช้ `.env.example` เป็น template เท่านั้น

---

## Rollback

ถ้าพยากรณ์ผิดพลาด:
```sql
-- ลบแถวของ model_version ที่มีปัญหา → fallback กลับ baseline อัตโนมัติ
DELETE FROM pm25_forecast_daily WHERE model_version = 'ml-local-v4.0' AND date >= CURRENT_DATE;
```
