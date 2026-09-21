# RiskCARE — แผนระบบแจ้งเตือนฝุ่นเฉพาะบุคคล

สถานะเอกสาร: รออนุมัติก่อนเริ่ม implement  
ขอบเขต: ออกแบบเท่านั้น ยังไม่แก้โค้ด ฐานข้อมูล หรือค่า threshold

## 0. ข้อค้นพบจากโครงสร้างปัจจุบัน

| ประเด็น | สิ่งที่พบ |
|---|---|
| แอปผู้ใช้ | `frontend` เป็น React/Vite (`frontend/package.json`, `frontend/src/App.jsx`) และใช้ `react-router-dom` ไม่ใช่ Next.js |
| ชุดแอดมิน/ฐานข้อมูล | `admin-app` มี Supabase schema และส่วน Next.js/แอดมินแยกจาก frontend |
| แหล่งข้อมูล AQI/PM2.5 | `frontend/src/services/airQuality.js` ดึง/รวมข้อมูลสถานีและ PM2.5; `frontend/src/utils/aqiStatus.js` แปลง AQI เป็นสถานะ |
| จุดแสดงผลฝุ่น | `frontend/src/components/Pm25AlertCard.jsx`, `frontend/src/pages/Home.jsx`, `frontend/src/pages/Overview.jsx`, `frontend/src/pages/RegionalDashboard.jsx` |
| แบบประเมินสุขภาพ | `frontend/src/pages/Assessment.jsx` บันทึก `risk_assessments` และอัปเดต `profiles.health_risk_group` |
| Schema ที่เกี่ยวข้อง | `admin-app/supabase/schema.sql`: `profiles`, `risk_assessments`, RLS และค่า `health_risk_group` (`low`, `moderate`, `high_critical`) |

> หมายเหตุ: ต้องยืนยันก่อน implement ว่า deployment ที่จะเพิ่มฟีเจอร์นี้คือ `frontend` (Vite) หรือมีการย้ายไป Next.js จริง เพราะ routing, env และ build configuration ต่างกัน

## 1. เป้าหมายและหลักการ

1. แสดงค่า PM2.5/AQI ทางการตามมาตรฐานที่เลือกอย่างโปร่งใส
2. แสดงระดับคำเตือนเฉพาะบุคคลโดยอิงสถานะสุขภาพ ไม่ใช้ตัวคูณหรือคะแนนใหม่ที่ไม่มีแหล่งอ้างอิง
3. ใช้ค่า PM2.5 ดิบที่เป็นค่าเฉลี่ย 24 ชั่วโมงในการจับช่วง ไม่ใช่ค่าที่ปัดเศษเพื่อแสดงผล
4. คำเตือนต้องมีข้อความ ไม่พึ่งสีอย่างเดียว และระบุว่าอิงมาตรฐานใด/โปรไฟล์ใด
5. หากข้อมูลสุขภาพไม่ครบ ให้แสดงสถานะ “ยังประเมินไม่ได้” แทนการเดา

## 2. Data model ที่เสนอ

### 2.1 ชุด threshold

แนะนำเก็บเป็น configuration แบบ versioned และตรวจสอบได้ โดยเริ่มจากไฟล์ข้อมูลกลาง เช่น `frontend/src/data/pm25Thresholds.json` หรือ `.ts` (ยังไม่สร้างจนกว่าจะอนุมัติ) หากต้องการให้ผู้ดูแลแก้ผ่าน Dashboard ภายหลัง จึงย้ายชุดเดียวกันไปตาราง Supabase โดยไม่ให้ frontend มีตัวเลขซ้ำหลายจุด

| Field | ชนิด | ความหมาย |
|---|---|---|
| `set_id` | string | `us_epa_2024` หรือ `thai_2566` |
| `audience` | enum | `general` / `sensitive` |
| `pollutant` | string | `PM2.5` |
| `unit` | string | `µg/m³` |
| `averaging_period` | string | `24h` |
| `min_inclusive` | number/null | ขอบล่างของช่วง |
| `max_inclusive` | number/null | ขอบบนของช่วง; null สำหรับ `+` |
| `level_code` | string | รหัสคงที่สำหรับ logic |
| `label_th` / `label_en` | string | ข้อความแสดงผล |
| `color_token` | string | token สี UI ไม่ฝังสีไว้ใน logic |
| `source` | string | ชื่อประกาศ/หน่วยงาน/ปี |
| `effective_date` | date/null | วันที่เริ่มใช้ถ้ามี |
| `version` | string | เวอร์ชันข้อมูล |
| `notes` | string/null | หมายเหตุและข้อจำกัด |

### 2.2 ค่าที่ต้องเก็บ/อ่านจากโปรไฟล์สุขภาพ

ใช้ของเดิมก่อน: `profiles.health_risk_group`, `profiles.has_completed_assessment` และ `risk_assessments.answers`. ไม่สร้างคอลัมน์ใหม่จนกว่าจะพบว่าฟิลด์ใน `answers` ไม่พอ

| ข้อมูล | แหล่งปัจจุบัน | การใช้งาน |
|---|---|---|
| กลุ่มผลประเมิน | `profiles.health_risk_group` | ค่า summary สำหรับเลือก general/sensitive |
| ทำแบบประเมินแล้วหรือไม่ | `profiles.has_completed_assessment` | ป้องกันการแสดงคำเตือนเฉพาะบุคคลเมื่อยังไม่มีข้อมูล |
| คำตอบรายข้อ | `risk_assessments.answers` | ตรวจสอบ asthma/COPD/หัวใจ/อายุ/สูบบุหรี่/ตั้งครรภ์ และ audit |
| เวอร์ชันเกณฑ์ | เสนอเพิ่มในผลคำนวณ/metadata ภายหลัง | ระบุว่าแจ้งเตือนด้วย threshold ชุดใด |

หากต้องการเก็บผลคำนวณถาวรในอนาคต ให้แยกเป็นผลลัพธ์ที่มี `user_id`, `pm25_value`, `pm25_unit`, `averaging_period`, `threshold_set_id`, `audience`, `level_code`, `evaluated_at`, `source_timestamp` และ `source_station` แต่ไม่จำเป็นต่อ MVP หากคำนวณแบบอ่านสดได้

## 3. ตาราง threshold ที่ใช้ในแผน (ตัวเลขตามข้อมูลที่ให้มาเท่านั้น)

### 3.1 US EPA PM2.5 breakpoint (2024)

| ระดับ | PM2.5 (µg/m³, 24 ชม.) |
|---|---:|
| Good | 0–9.0 |
| Moderate | 9.1–35.4 |
| Unhealthy for Sensitive Groups | 35.5–55.4 |
| Unhealthy | 55.5–125.4 |
| Very Unhealthy | 125.5–225.4 |
| Hazardous | 225.5+ |

### 3.2 เกณฑ์ไทย (ประกาศ คพ. 2566)

| ระดับ | PM2.5 (µg/m³, 24 ชม.) |
|---|---:|
| ดีมาก | 0–15.0 |
| ดี | 15.1–25.0 |
| ปานกลาง | 25.1–37.5 |
| เริ่มมีผลกระทบต่อสุขภาพ | 37.6–75.0 |
| มีผลกระทบต่อสุขภาพ | 75.1+ |

**ข้อกำหนดการเลือกชุด:** ต้องให้เจ้าของผลิตภัณฑ์ยืนยันว่าจะใช้ชุดไทยเป็นระดับหลักใน UI ไทย หรือแสดงทั้งไทยและ EPA ควบคู่กัน ห้ามผสมช่วงของสองมาตรฐานเป็น threshold ใหม่โดยไม่มีการอนุมัติ

## 4. ตรรกะ Profile → audience/tier

### 4.1 กฎที่เสนอให้อนุมัติ

| สถานะข้อมูล | audience ที่ใช้ | การแสดงผล |
|---|---|---|
| ทำแบบประเมินแล้ว และไม่มีปัจจัยเสี่ยงที่ยืนยันได้ | `general` | ระดับตามชุดมาตรฐานหลัก |
| พบ asthma หรือ COPD | `sensitive` | ใช้คำเตือนกลุ่มเสี่ยงตามมาตรฐานที่เลือก |
| พบโรคหัวใจ | `sensitive` | ใช้คำเตือนกลุ่มเสี่ยงตามมาตรฐานที่เลือก |
| ตั้งครรภ์ | `sensitive` | ใช้คำเตือนกลุ่มเสี่ยงตามมาตรฐานที่เลือก |
| อายุ/การสูบบุหรี่เข้าข่ายเกณฑ์ที่แพทย์หรือผลิตภัณฑ์อนุมัติ | `sensitive` | ต้องมีเกณฑ์ยืนยันก่อนเปิดใช้ |
| `health_risk_group = moderate` หรือ `high_critical` | เบื้องต้นเสนอ `sensitive` | ต้องยืนยันว่า summary เดิมมีความหมายครอบคลุมปัจจัยเหล่านี้จริง |
| ยังไม่ทำแบบประเมิน/ข้อมูลไม่ครบ | `unknown` | แสดงค่า/ระดับทางการเท่านั้น พร้อมชวนทำแบบประเมิน |

หลักการตัดสินใจเมื่อมีหลายปัจจัย: ใช้กฎแบบมีปัจจัยใดปัจจัยหนึ่งที่ “ยืนยันแล้ว” ก็เข้ากลุ่ม `sensitive` ไม่รวมคะแนน ไม่คูณค่า และไม่สร้าง severity เพิ่มเอง หากข้อมูลขัดแย้งหรือเป็น `unknown` ให้คง `unknown` และแสดงเหตุผลให้ผู้ใช้ทราบจนกว่าจะได้ข้อมูลยืนยัน

### 4.2 จุดเริ่มคำเตือนกลุ่มเสี่ยง

จุดสังเกตจากโจทย์คือ 37.6 µg/m³ ของไทยใกล้กับ 35.5 µg/m³ ของ EPA ซึ่งสามารถใช้เป็น “จุดเริ่มการอธิบายความเสี่ยง” ได้ แต่ยังไม่ควรสร้าง threshold sensitive ใหม่จากสองตัวเลขนี้ การ implement ต้องเลือกอย่างใดอย่างหนึ่ง:

- ใช้ตารางไทยเดิม แล้วเปลี่ยน copy/คำแนะนำตาม audience โดยไม่เปลี่ยน breakpoint; หรือ
- ใช้ตาราง EPA เดิมสำหรับ sensitive ตามแหล่งอ้างอิง โดยไม่ปรับตัวเลข

ต้องขออนุมัติ product/ผู้เชี่ยวชาญก่อนเลือกวิธีใดวิธีหนึ่ง

## 5. จุดเชื่อมกับระบบเดิม

| จุด | ไฟล์ | แผนการเปลี่ยนแปลง |
|---|---|---|
| แปลง AQI/สถานะ | `frontend/src/utils/aqiStatus.js` | แยก pure functions สำหรับ PM2.5 24h, threshold set และ audience; ให้ UI เรียกใช้จุดเดียว |
| โหลดสถานี/PM2.5 | `frontend/src/services/airQuality.js` | ยืนยันหน่วย, timestamp และ averaging period; ห้ามใช้ค่าที่ไม่ใช่ 24h โดยไม่ติดป้าย |
| การ์ดแจ้งเตือน | `frontend/src/components/Pm25AlertCard.jsx` | อ่าน `profiles`/ผลประเมิน, แสดง official + personalized แยกกัน และรองรับ unknown |
| หน้าภาพรวม | `frontend/src/pages/Overview.jsx`, `frontend/src/pages/Home.jsx` | วางข้อความระดับทางการและระดับเฉพาะบุคคลให้สอดคล้องกัน |
| Dashboard ภูมิภาค | `frontend/src/pages/RegionalDashboard.jsx` | ระบุว่าค่าเป็นทางการ/สำหรับกลุ่มใด ไม่ใช้ label เดิมแบบกำกวม |
| แบบประเมิน | `frontend/src/pages/Assessment.jsx` | ตรวจว่าคำตอบที่ต้องใช้มีอยู่จริง, บันทึก version/ความไม่แน่นอนถ้าจำเป็น |
| ประวัติ | `frontend/src/pages/History.jsx` | อาจแสดงว่าโปรไฟล์ล่าสุดมาจากการประเมินครั้งใด |
| Schema | `admin-app/supabase/schema.sql` | ยังไม่แก้ในขั้นวางแผน; ใช้ `profiles`/`risk_assessments` เดิมก่อน |

## 6. UI/UX

### ผู้ที่ทำแบบประเมินแล้ว

แสดงเป็นสองชั้นใน card เดียวกัน:

1. `ค่า PM2.5/AQI ทางการ: 42 µg/m³ / AQI ...` พร้อมชื่อมาตรฐานและเวลาอัปเดต
2. `คำเตือนสำหรับคุณ: กลุ่มเสี่ยง — เริ่มมีผลกระทบต่อสุขภาพ` พร้อมคำอธิบายว่าอิงจากโปรไฟล์ใด เช่น “อ้างอิงจากแบบประเมินสุขภาพล่าสุด”

ใช้สี + label + icon/ข้อความ และมีลิงก์ “ดู/แก้ไขข้อมูลสุขภาพ” ไม่แสดง badge สองชุดจนผู้ใช้คิดว่าเป็นค่าคนละมลพิษ

### ผู้ที่ยังไม่ทำแบบประเมิน

แสดงค่าและระดับทางการตามปกติ พร้อมข้อความ:

> ยังไม่สามารถคำนวณคำเตือนเฉพาะบุคคลได้ — ทำแบบประเมินสุขภาพเพื่อรับคำแนะนำที่เหมาะกับคุณ

ห้ามเรียกผู้ใช้ว่า general โดยอัตโนมัติใน UI แม้ implementation อาจมี fallback ภายในสำหรับการจัด layout

### Accessibility

- ข้อความระดับต้องอ่านได้โดย screen reader
- สีต้องผ่าน contrast ที่เหมาะสมและไม่เป็นสัญญาณเดียว
- ระบุหน่วย `µg/m³`, ช่วงเวลาเฉลี่ย และ timestamp
- แยก “ค่า” กับ “คำแนะนำ” อย่างชัดเจน ไม่ใช้คำว่า AQI แทน PM2.5 โดยไม่บอกการแปลง

## 7. Open questions ที่ต้องตอบก่อน implement

1. ระบบผู้ใช้ที่จะ deploy คือ Vite `frontend` หรือจะย้ายเป็น Next.js ตามคำอธิบายโครงการ?
2. UI หลักจะยึดเกณฑ์ไทย 2566 หรือ EPA 2024 และจะแสดงอีกชุดเป็นข้อมูลอ้างอิงหรือไม่?
3. ต้องการนิยาม “กลุ่มเสี่ยง” สำหรับ sensitive อย่างเป็นทางการจากแหล่งใด โดยเฉพาะอายุเท่าใด, สูบบุหรี่แบบใด, ตั้งครรภ์ทุกระยะหรือไม่?
4. `health_risk_group` เดิม (`low/moderate/high_critical`) ครอบคลุม asthma/COPD/หัวใจจริงหรือไม่ หรือจำเป็นต้องใช้ `answers` รายข้อเป็นแหล่งหลัก?
5. ค่า PM2.5 จาก API ปัจจุบันเป็นค่าเฉลี่ย 24 ชั่วโมงจริงหรือเป็นค่ารายชั่วโมง/ค่าล่าสุด? ถ้าไม่ใช่ ต้องหาแหล่ง 24h หรือเปลี่ยน wording อย่างไร
6. ค่า “AQI” ในระบบปัจจุบันคำนวณจาก EPA breakpoint อยู่แล้วหรือไม่ และต้องปรับให้สอดคล้องกับเกณฑ์ไทยหรือไม่?
7. ต้องการคำแนะนำทางคลินิกของ asthma/COPD/heart จาก GINA, GOLD หรือหน่วยงานใด และใครเป็นผู้อนุมัติข้อความ?
8. เมื่อ profile เปลี่ยน ต้องใช้คำเตือนใหม่ทันทีหรือยึดผลประเมินล่าสุดจนทำแบบประเมินใหม่?
9. จะเก็บ audit ของ threshold/version และผลลัพธ์ที่ผู้ใช้เห็นหรือคำนวณสดทุกครั้ง?
10. มีข้อกำหนด privacy/consent สำหรับนำข้อมูลสุขภาพมาใช้ปรับคำเตือนและการเก็บ log หรือไม่?

## 8. แผนการทดสอบ

### 8.1 Boundary ของ EPA

ทดสอบค่าดิบอย่างน้อย: `0`, `9.0`, `9.1`, `35.4`, `35.5`, `55.4`, `55.5`, `125.4`, `125.5`, `225.4`, `225.5` และค่าต่ำกว่า 0, null, string ที่ไม่ใช่ตัวเลข

### 8.2 Boundary ของไทย

ทดสอบ: `0`, `15.0`, `15.1`, `25.0`, `25.1`, `37.5`, `37.6`, `75.0`, `75.1` และค่ามากกว่า 75

ทุก boundary ต้องยืนยันว่าไม่เกิดช่องว่าง เช่น 9.0–9.1 และ 15.0–15.1 และต้องตรวจด้วยค่าดิบก่อน rounding

### 8.3 Profile mapping

- ไม่มีโรค/ผลประเมิน low → general
- asthma → sensitive
- COPD → sensitive
- heart disease → sensitive
- ตั้งครรภ์ → sensitive เมื่อกฎได้รับอนุมัติ
- อายุ/สูบบุหรี่แต่ข้อมูลไม่ครบ → unknown/รอเกณฑ์ ไม่เดา
- หลายปัจจัยพร้อมกัน → sensitive หนึ่งครั้ง ไม่บวกคะแนน
- ไม่มี assessment → official only + CTA
- เปลี่ยน assessment แล้ว reload → tier และข้อความอัปเดตถูกต้อง

### 8.4 Data/API/UI

- หน่วยผิดหรือไม่มี averaging period ต้องไม่แสดงเป็น “ค่าเฉลี่ย 24 ชม.”
- API ล่ม/ไม่มีสถานี/ข้อมูลเก่า ต้องมีสถานะ error/stale ที่อ่านเข้าใจได้
- ตรวจว่า official level และ personalized alert ไม่ขัดแย้งหรือแสดงซ้ำซ้อน
- ตรวจ RLS ว่าผู้ใช้เห็นเฉพาะ profile/assessment ของตนเอง
- ทดสอบมือถือ/แท็บเล็ต/desktop และ screen reader/keyboard
- regression test หน้า Home, Overview, Regional Dashboard, Assessment และ History

## 9. ลำดับงานหลังได้รับอนุมัติ

1. ตอบ open questions และเลือกมาตรฐานหลัก
2. ยืนยัน schema/config source of truth และนิยาม mapping กับผู้เชี่ยวชาญ
3. ทำ unit tests ของ threshold/mapping ก่อนแตะ UI
4. ทำ service กลางสำหรับ profile + PM2.5 interpretation
5. ปรับ card/pages ที่ระบุ พร้อมทดสอบ regression
6. ตรวจ privacy, RLS, copy และ deploy preview บน Vercel

