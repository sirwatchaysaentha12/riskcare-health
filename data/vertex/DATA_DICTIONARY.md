# Data Dictionary — Vertex AI PM2.5 Daily Forecast Dataset

ชุดข้อมูลสำหรับ Vertex AI Tabular Forecasting (Phase 1 ของ VERTEX-AI-FORECAST-PROMPT.md)
ไฟล์: `data/vertex/pm25_daily_vertex.csv` — export จาก Supabase `public.air_quality_daily` (ข้อมูลจริงที่ ingest มาแล้วเท่านั้น)

## คอลัมน์ (ตรงตามสเปกเฟส 1)

| คอลัมน์ | ชนิด | ความหมาย | หมายเหตุ |
|---|---|---|---|
| `timestamp` | string `YYYY-MM-DD` | วันที่ของค่าเฉลี่ยรายวัน | เป็น **day key ตาม Asia/Bangkok** (การ rollup รายวันของ ingest ตัดวันตามเวลาไทย) — แสดงผลผู้ใช้เป็นเวลาไทยเสมอ |
| `pm25` | numeric (µg/m³) | **Target column** — ค่าเฉลี่ย PM2.5 รายวัน | ทุกแถวเป็นค่าที่วัดจริงจากสถานี (observed) ไม่มีค่าอิมพิวต์ |
| `location_id` | string | **Time series identifier** — OpenAQ sensor/station id | เช่น `1304082` — ห้ามใช้ชื่อสถานีแทน |
| `province` | string | จังหวัดของสถานี | ปัจจุบันทุกสถานี = `กรุงเทพมหานคร` (ตรวจจากชื่อสถานี + กรอบพิกัด); สถานีอื่นในอนาคตจะได้ `UNKNOWN` หากระบุไม่ได้ |
| `latitude` | numeric | ละติจูดของสถานี | จาก OpenAQ metadata |
| `longitude` | numeric | ลองจิจูดของสถานี | จาก OpenAQ metadata |
| `air_quality_source` | string | แหล่งข้อมูล | ค่าคงที่ `OpenAQ` |
| `is_observed` | boolean | จริง/คาดการณ์ | ทุกแถวในไฟล์นี้ = `true` (ข้อมูลจริง) — ไฟล์นี้ใช้เทรนเท่านั้น ไม่มีแถว forecast |

## คอลัมน์ที่พิจารณาแล้ว**ไม่รวม** (พร้อมเหตุผล)

| คอลัมน์ | เหตุผลที่ไม่รวม |
|---|---|
| `temperature`, `humidity`, `wind_speed`, `wind_direction`, `rainfall` | ในตารางต้นทางมีแต่ **ครอบคลุม 0%** ของแถว (ไม่มีสถานีไหนมีข้อมูล) — เฟส 3 ห้ามใช้ future features ที่ระบบไม่มี ณ เวลาทำนาย จึงตัดออกทั้งหมด |
| `pm10`, `pressure` | ปัจจุบัน ingest ไม่บันทึกค่าเหล่านี้ (null ทั้งหมด) — ถ้าอนาคตมีข้อมูลจริง ณ เวลาทำนายค่อยพิจารณาเพิ่ม |
| `sample_count`, `daily_min`, `daily_max` | ตารางต้นทางไม่ได้เก็บ (rollup เดิมเก็บเฉลี่ยเดียว) — บันทึกเป็นข้อจำกัด |
| `hour_of_day` | ข้อมูลเป็นรายวันแล้ว — ไม่มีนัยยะ |
| `day_of_week`, `month` | Vertex AI forecasting สร้าง calendar features ให้เองจาก `timestamp` ไม่ต้อง export ซ้ำ |

## การแบ่ง Train/Validation/Test (สรุป — รายละเอียดใน Phase 2)

- **Time-based split เท่านั้น** (ห้าม random split เพราะเป็น time series)
- แผนเบื้องต้น: Train ≈ 2023-09-28 → 2026-03-31 · Validation ≈ 2026-04-01 → 2026-06-30 · **Test (holdout) ≈ 2026-07-01 → 2026-09-30** (ช่วงท้ายสุด 3 เดือน ไม่เคยใช้เทรน/จูน)
- ตัวเลขสุดท้ายจะขึ้นจริงหลังตรวจ coverage รายสถานีใน Phase 2

## วิธี regenerate ไฟล์ CSV

```bash
cd C:\Users\ACER\projectweb\admin-app
node scripts/vertex-export-dataset.mjs
```

สคริปต์ตรวจว่ามี `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` ใน `admin-app/.env.local` (ค่าไม่ถูกแสดง) และแสดงเฉพาะสถิติผล export
