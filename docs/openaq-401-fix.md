# OpenAQ 401 — สาเหตุและการแก้ไข (2026-09-24)

สำหรับ agent/ผู้ทำงานต่อ: ปัญหานี้ **แก้เรียบร้อยแล้ว** ไฟล์นี้คือบันทึกสาเหตุและหลักฐาน

## อาการ

- `/api/air-quality/dashboard` คืน HTTP 502 + `error: "OPENAQ_API_KEY_REJECTED"`, `upstreamStatus: 401`
- historical/forecast เป็น 0 จุด

## สาเหตุ (ยืนยันด้วยการทดสอบจริง)

ค่า `OPENAQ_API_KEY` ใน `admin-app/.env.local` ถูกวางโดยมีวงเล็บมุม `< >` ติดมาด้วย:

```
OPENAQ_API_KEY=<02138b49...ffd36c>   ← ผิด (มี < > ติดมาจากการ copy)
```

อักขระ `<` `>` ถูกส่งไปกับ header `X-API-Key` ทั้งหมด OpenAQ จึงตอบ `401 {"detail":"Invalid credentials"}`

หลักฐาน (curl ตรงไปที่ api.openaq.org):

| การทดสอบ | ผล |
|---|---|
| ไม่ใส่ key | HTTP 401 |
| key พร้อม `< >` (ค่าเดิมใน .env.local) | HTTP 401 Invalid credentials |
| key ตัวเดิมแต่ตัด `< >` ออก | **HTTP 200 + ข้อมูลจริง** |

สรุป: key ตัวจริงถูกต้องและยังใช้ได้ — ปัญหาอยู่ที่อักขระวงเล็บที่ติดมาตอน copy จากหน้าเว็บ/เอกสารเท่านั้น

## การแก้ที่ทำไปแล้ว

แก้ `admin-app/.env.local` บรรทัดเดียว — ตัด `< >` ออก:

```
OPENAQ_API_KEY=02138b49...ffd36c
```

## ผลหลังแก้ (ยืนยันแล้ว)

`GET http://127.0.0.1:3000/api/air-quality/dashboard` ตอนนี้คืน:
- `historical: 45 จุด`, `forecast: 3 จุด`, `error: none`, `upstreamStatus: none`

## ข้อสังเกตสำหรับงานต่อไป

1. ~~**Validation ใน `src/lib/openAqClient.ts` ยังไม่จับอักขระ `< >`**~~ — **แก้แล้ว (2026-09-24):** มี `src/lib/apiKeySanitize.ts` (pure, ตัด `< >`/ช่องว่างรอบนอกอัตโนมัติ + ปัด malformed) โดย `getApiKey()` เรียกใช้ — เทสต์อยู่ที่ `tests/openAqApiKey.test.mjs` (5 เคส, รวมเคสเหตุการณ์จริง) รันด้วย `node --test tests/openAqApiKey.test.mjs`
2. **ข้อมูล OpenAQ ของ sensor ที่ตั้งค่าไว้หยุดที่ 2023-06-18** (sensor นั้นไม่อัปโหลดข้อมูลใหม่) — `calculateTrend()` ใน `src/lib/pm25Trend.ts` จะยังทำงานได้ (ใช้ 6 จุดล่าสุด) แต่คือข้อมูลปี 2023 ถ้าต้องการแนวโน้มสด ควรพิจารณาดึงค่าล่าสุดจาก Air4Thai/DustBoy (มี route `/api/stations` อยู่แล้ว) เสริมด้านหน้า
3. ถ้าแก้ `.env.local` แล้วยังเจอ 401 อีก → restart dev server (Next.js อ่าน env ตอน start; กรณีนี้ hot-reload ค่าให้อยู่แล้วจึงไม่ต้อง restart)
