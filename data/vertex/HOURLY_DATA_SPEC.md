# Data Specification — ข้อมูล PM2.5 รายชั่วโมง (สำหรับ hourly forecast)

สถานะ: **ข้อมูลจริงมีอยู่** (พิสูจน์ด้วย probe จริง 3 ต.ค. 2569) — แต่ยังไม่เริ่มเทรน ต้องรวบรวม/ทำ pipeline ก่อน

## 1. Source ที่ยืนยันแล้ว

| หัวข้อ | ค่า |
|---|---|
| API | OpenAQ v3 `GET /v3/sensors/{sensor_id}/measurements` (raw hourly) |
| Auth | header `X-API-Key` (key เดียวกับที่ระบบใช้ — ⚠️ ห้ามใช้ header `apikey` จะได้ 401) |
| การทดสอบจริง | sensor 1304179 + 1304281 → HTTP 200, 1,000 ชั่วโมงแรก (2021-04-30 →) |
| Field | `value` (µg/m³, pm2.5 — parameter_id 2) · timestamp จาก `period.datetimeFrom.local` (+07:00) |
| Timezone | เอกสารกำกับว่า daily rollup ตัดวันเที่ยงคืน Asia/Bangkok — hourly `.local` อยู่เขต +07:00 |
| Sampling | ไม่ครบ 24 ชม./วัน (จริง ~1–23 ชม./วัน, มีวันหาย) — **ต้องมี missing policy** |
| ⚠️ ข้อจำกัด endpoint | **ไม่กรอง date_from/date_to** (ทดสอบยืนยัน: ขอ 2026 ได้ 2021) — ต้อง crawl แบบ paginate จนถึงหน้าปัจจุบัน + กรองวันฝั่งเรา |

## 2. Missing-value policy (เสนอ)

- ชั่วโมงที่หาย → เว้นเป็น NaN ห้าม interpolate ก่อน split
- วันที่มี < 12 ชั่วโมงข้อมูล → ทำเครื่องหมาย `low_coverage` (ค่าเฉลี่ยรายวันอาจเอียง)
- aggregate เป็นรายวันได้เฉพาะวันที่ ≥ 12 ชั่วโมง · วันอื่นติด `estimated`/`missing`

## 3. Quality-control rules (เสนอ)

- ค่า < 0 หรือ > 500 µg/m³ → ทิ้งต่อชั่วโมง (ตาม QC ของ daily ที่ใช้อยู่)
- duplicate timestamp ต่อ sensor → เฉลี่ย + นับจำนวน
- สถานีที่เปลี่ยนพิกัด → แยก location_id ใหม่ (ยังไม่พบกรณีใน 33 สถานี)

## 4. Train/Val/Test (time-based เท่านั้น)

- ข้อมูลเก่าสุดที่พบ: **2021-04-30** → โอกาสครอบคลุมฤดูฝุ่นหลายปี (~5 ฤดู)
- เสนอ: Train 2021→2025-09 · Val 2025-10→2026-03 (รวมฤดูฝุ่น) · Test(holdout) 2026-04→ปัจจุบัน
- ปรับได้ตามปริมาณจริงหลัง crawl เสร็จ

## 5. Retention และจัดเก็บ

- ตำแหน่ง: ตารางใหม่ `air_quality_hourly` (station_id, ts_local, pm25, n_samples) — RLS on, service_role เท่านั้น (เหมือน daily/forecast ที่ทำไว้)
- ห้าม commit CSV/parquet ดิบลง git (ใช้ Supabase/Storage)
- retention: ไม่ลบ (ข้อมูลสาธารณะสถานี, ไม่มีข้อมูลส่วนบุคคล)

## 6. ความเสี่ยงที่รู้ก่อนเริ่ม

- การ crawl ย้อน 5 ปี ≈ 40+ หน้า/sensor × 33 sensors (~1,300 calls) — ต้องมี rate-limit + resume
- ข้อมูลบางช่วงอาจมีเฉพาะบางสถานี (สถานีเปิดปีต่างกัน — daily เองก็ min 154 วัน)
- OpenAQ อาจหน่วงการ publish ชั่วโมงล่าสุด 2–3 วัน (เหมือน daily)
