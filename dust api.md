# API ข้อมูลคุณภาพอากาศ PM2.5 สำหรับประเทศไทย

เอกสารนี้รวบรวม API ที่เหมาะสำหรับนำไปเปรียบเทียบค่าฝุ่นกับผลคัดกรองความเสี่ยงสุขภาพของผู้ใช้

> ข้อควรระวัง: ค่า PM2.5/AQI เป็นข้อมูลสิ่งแวดล้อม ไม่ใช่การวินิจฉัยสุขภาพ ควรแสดงเวลาอัปเดต แหล่งข้อมูล และความไม่แน่นอนของตำแหน่งทุกครั้ง

## สรุปการเลือกใช้ตามพื้นที่

| ระดับพื้นที่ | API ที่เหมาะ | หมายเหตุ |
|---|---|---|
| จังหวัด | Air4Thai, DustBoy, Open-Meteo | Air4Thai/DustBoy ใช้สถานีจริง; Open-Meteo เป็นแบบจำลองตามพิกัด |
| อำเภอ | DustBoy ใกล้พิกัด, Air4Thai สถานีใกล้เคียง, Open-Meteo | ต้อง map พิกัดกับขอบเขตอำเภอเอง และควรแสดงระยะห่างจากสถานี |
| ตำบล/ชุมชน | DustBoy `nearme`, Air4Thai สถานีใกล้เคียง, Open-Meteo | ไม่มี API ใดรับประกันว่ามีสถานีครบทุกตำบล; ห้ามเรียกค่าจากสถานีใกล้เคียงว่าเป็นค่าที่วัดในตำบลโดยตรง |

แนวทางที่แนะนำสำหรับโปรเจกต์คือใช้ DustBoy หรือ Air4Thai เป็นค่าจากสถานีจริงเมื่อมีสถานีใกล้พิกัด และใช้ Open-Meteo เป็น fallback เมื่อไม่มีสถานี โดยบันทึก `source`, `station`, `distance_km`, `observed_at` และ `resolution` ไปพร้อมกับค่า PM2.5

---

## 1. Air4Thai — กรมควบคุมมลพิษ

### เว็บไซต์และคำอธิบาย

- เว็บไซต์หลัก: [air4thai.pcd.go.th](https://air4thai.pcd.go.th/)
- แหล่งข้อมูลภาครัฐ: [ชุดข้อมูลสถานีตรวจวัดคุณภาพอากาศ](https://naturebi.mnre.go.th/ckan/dataset/air4thai)
- เป็นข้อมูลจากสถานีตรวจวัดของกรมควบคุมมลพิษ โดยมีข้อมูลตำแหน่งสถานีและมลพิษ เช่น AQI, PM2.5, PM10, O3, NO2 และ CO

### Endpoint และการเข้าถึง

```text
http://air4thai.pcd.go.th/services/getNewAQI_JSON.php
```

- Public access ตาม endpoint ที่เผยแพร่ ไม่ต้องใช้ API Key
- Endpoint เป็น `http://` จึงไม่ควรเรียกตรงจากหน้าเว็บ HTTPS เพราะอาจติด Mixed Content; ควรเรียกผ่าน backend/server proxy แล้วส่งข้อมูลที่จำเป็นให้ frontend
- ควรตั้ง timeout, retry แบบจำกัด และตรวจสอบว่า response เป็น JSON ก่อนใช้งาน

### โครงสร้าง JSON โดยทั่วไป

โครงสร้างอาจเปลี่ยนได้ ควรอ่านแบบ defensive โดยทั่วไปจะมีรายการสถานีและข้อมูลล่าสุดใน `AQILast`:

```json
{
  "stations": [
    {
      "stationID": "02t",
      "nameTH": "สวนลุมพินี",
      "nameEN": "Lumphini Park",
      "lat": "13.7308",
      "long": "100.5418",
      "areaTH": "กรุงเทพมหานคร",
      "areaEN": "Bangkok",
      "AQILast": {
        "date": "2026-08-15",
        "time": "10:00",
        "PM25": { "value": "18", "aqi": "35" },
        "PM10": { "value": "32", "aqi": "30" },
        "O3": { "value": "12", "aqi": "10" }
      }
    }
  ]
}
```

> ชื่อ field และชนิดข้อมูลจริงควรตรวจจาก response ล่าสุดก่อนนำไปใช้ เพราะค่าบาง field อาจเป็น string, `-`, `null` หรือไม่มีในบางสถานี

### ตัวอย่าง JavaScript Fetch

```js
async function fetchAir4Thai() {
  const endpoint = 'http://air4thai.pcd.go.th/services/getNewAQI_JSON.php'
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) })

  if (!response.ok) throw new Error(`Air4Thai HTTP ${response.status}`)
  const payload = await response.json()

  return (payload.stations ?? []).map((station) => ({
    source: 'air4thai',
    stationId: station.stationID,
    name: station.nameTH ?? station.nameEN,
    latitude: Number(station.lat),
    longitude: Number(station.long),
    pm25: Number(station.AQILast?.PM25?.value),
    pm25Aqi: Number(station.AQILast?.PM25?.aqi),
    observedAt: `${station.AQILast?.date ?? ''} ${station.AQILast?.time ?? ''}`.trim(),
  }))
}
```

---

## 2. DustBoy — CCDC มหาวิทยาลัยเชียงใหม่

### เว็บไซต์และจุดเด่น

- เว็บไซต์หลัก: [cmuccdc.org](https://www.cmuccdc.org/)
- Portal/API สำหรับนักพัฒนา: [open-api.cmuccdc.org](https://open-api.cmuccdc.org/)
- มีข้อมูลจากเซ็นเซอร์ DustBoy และ metadata ของจุดติดตั้ง
- รองรับข้อมูลรายสถานี รายจังหวัด และค้นหาสถานีใกล้พิกัด
- เหมาะกับการหาค่าที่ใกล้ระดับตำบล/ชุมชนมากกว่า API ที่มีแต่ค่าพิกัดแบบจำลอง แต่ต้องตรวจว่าพื้นที่นั้นมีเซ็นเซอร์จริงหรือไม่
- เอกสารระบุ endpoint `nearme` ค้นหาสถานีภายในระยะสูงสุด 20 กิโลเมตร

### การยืนยันตัวตน

ต้องลงทะเบียนและยืนยันตัวตนเพื่อขอ API Key ฟรี จากนั้นส่ง token ผ่าน header:

```http
Authorization: Bearer YOUR_DUSTBOY_API_KEY
```

อย่าใส่ Bearer Token ใน frontend ที่เผยแพร่สาธารณะ ควรเก็บใน environment variable ของ backend/server route

### Endpoint สำคัญ

```text
GET https://open-api.cmuccdc.org/api/dustboy/stations
GET https://open-api.cmuccdc.org/api/dustboy/province
GET https://open-api.cmuccdc.org/api/dustboy/nearme/{latitude}/{longitude}/{distance}
GET https://open-api.cmuccdc.org/api/dustboy/data30day/{id}
```

`stations` ใช้ดึงรายการสถานีและสถานะล่าสุด, `province` ใช้ข้อมูลรายจังหวัด และ `nearme` ใช้ค้นหาสถานีใกล้พิกัดผู้ใช้ โดย `distance` มีเพดานตามเอกสาร API

### ตัวอย่าง JavaScript Fetch: ทุกสถานี

```js
async function fetchDustBoyStations() {
  const response = await fetch('https://open-api.cmuccdc.org/api/dustboy/stations', {
    headers: { Authorization: `Bearer ${import.meta.env.VITE_DUSTBOY_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) throw new Error(`DustBoy HTTP ${response.status}`)
  return response.json()
}
```

### ตัวอย่าง JavaScript Fetch: สถานีใกล้พิกัด

```js
async function fetchNearbyDustBoy(latitude, longitude, distanceKm = 20) {
  const endpoint = [
    'https://open-api.cmuccdc.org/api/dustboy/nearme',
    latitude,
    longitude,
    Math.min(distanceKm, 20),
  ].join('/')

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${import.meta.env.VITE_DUSTBOY_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) throw new Error(`DustBoy HTTP ${response.status}`)
  return response.json()
}
```

> สำหรับ production ให้ย้าย Fetch นี้ไป server-side เพราะ Vite `VITE_*` variables จะถูกส่งไปยัง browser และผู้ใช้สามารถอ่าน token ได้

---

## 3. Open-Meteo Air Quality API

### เว็บไซต์และจุดเด่น

- เว็บไซต์หลัก: [open-meteo.com](https://open-meteo.com/)
- เอกสาร: [Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- ส่ง `latitude` และ `longitude` ของผู้ใช้ไปขอค่า PM2.5 ณ grid cell ที่ใกล้ที่สุด
- ฟรีและไม่ต้องใช้ API Key สำหรับการใช้งานทั่วไปตามเงื่อนไขของบริการ
- เหมาะเป็น fallback ครอบคลุมทุกอำเภอ/ตำบลที่มีพิกัด แต่เป็นค่าจากแบบจำลอง ไม่ใช่การวัดจากสถานีในตำบลนั้นโดยตรง
- เอกสารระบุความละเอียดโดยประมาณ 11 กิโลเมตรสำหรับ CAMS Europe และ 45 กิโลเมตรสำหรับ CAMS Global ขึ้นกับ domain ที่เลือก

### Endpoint

```text
https://air-quality-api.open-meteo.com/v1/air-quality
```

### ตัวอย่าง JavaScript Fetch: PM2.5 ปัจจุบันและรายชั่วโมง

```js
async function fetchOpenMeteoPm25(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'pm2_5',
    hourly: 'pm2_5',
    timezone: 'Asia/Bangkok',
    forecast_days: '1',
  })

  const response = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
    { signal: AbortSignal.timeout(10000) },
  )

  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`)
  const payload = await response.json()

  return {
    source: 'open-meteo',
    latitude: payload.latitude,
    longitude: payload.longitude,
    pm25: payload.current?.pm2_5 ?? null,
    unit: payload.current_units?.pm2_5 ?? 'µg/m³',
    hourly: payload.hourly,
  }
}
```

Open-Meteo ระบุว่า `pm2_5` มีหน่วย `µg/m³` และ response แบบ hourly จะมี `time` กับ array ของค่า PM2.5 ที่ index ตรงกัน

---

## 4. WAQI — World Air Quality Index

### เว็บไซต์และการขอ Token

- เว็บไซต์หลัก: [waqi.info](https://waqi.info/)
- เอกสาร API: [aqicn.org/api](https://aqicn.org/api/)
- หน้าขอ Token: [data-platform token](https://aqicn.org/data-platform/token/)
- ต้องใช้ token จริงในการเรียก API; `demo` ใช้ได้เฉพาะตัวอย่างและมีข้อจำกัด

### Endpoint ตามพิกัด

```text
https://api.waqi.info/feed/geo:{latitude};{longitude}/?token={YOUR_TOKEN}
```

ตัวอย่าง:

```text
https://api.waqi.info/feed/geo:13.7563;100.5018/?token=YOUR_TOKEN
```

WAQI จะเลือกข้อมูลจากสถานี/แหล่งข้อมูลที่เหมาะสมใกล้พิกัด ไม่ได้หมายความว่าเป็นค่าที่วัดตรงตำแหน่ง GPS ของผู้ใช้ และควรตรวจ `city.geo`, `time` และ `iaqi.pm25` ก่อนแสดงผล

### ตัวอย่าง JavaScript Fetch

```js
async function fetchWaqiByLocation(latitude, longitude) {
  const token = import.meta.env.VITE_WAQI_TOKEN
  if (!token) throw new Error('Missing WAQI token')

  const endpoint = `https://api.waqi.info/feed/geo:${latitude};${longitude}/?token=${encodeURIComponent(token)}`
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) })

  if (!response.ok) throw new Error(`WAQI HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.status !== 'ok') throw new Error('WAQI returned a non-ok response')

  return {
    source: 'waqi',
    station: payload.data?.city?.name ?? null,
    latitude: Number(payload.data?.city?.geo?.[0]),
    longitude: Number(payload.data?.city?.geo?.[1]),
    aqi: payload.data?.aqi ?? null,
    pm25: payload.data?.iaqi?.pm25?.v ?? null,
    observedAt: payload.data?.time?.iso ?? payload.data?.time?.s ?? null,
  }
}
```

WAQI ระบุว่าต้องใช้ attribution ของ World Air Quality Index และแหล่งข้อมูลต้นทาง รวมถึงมีข้อจำกัดด้าน quota, การขายข้อมูล, การ cache/archive และการใช้ในบริการเชิงพาณิชย์ ควรตรวจ Terms ล่าสุดก่อนนำไปใช้ production

---

## แนวทางรวมข้อมูลเข้ากับระบบความเสี่ยง

ควร normalize response ทุก API ให้เป็นรูปแบบเดียวกัน:

```js
{
  source: 'air4thai' | 'dustboy' | 'open-meteo' | 'waqi',
  pm25: 0,
  unit: 'µg/m³',
  observedAt: '2026-08-15T10:00:00+07:00',
  latitude: 13.7563,
  longitude: 100.5018,
  stationId: null,
  stationName: null,
  distanceKm: null,
  resolution: 'station' | 'model-grid',
}
```

ข้อเสนอแนะสำหรับการเปรียบเทียบกับกลุ่มความเสี่ยงของผู้ใช้:

1. ใช้ PM2.5 ล่าสุดและเวลาเดียวกันกับผลประเมิน หรือแสดง timestamp ให้ผู้ใช้เห็น
2. แยก `station` กับ `model-grid` ไม่รวมเป็นข้อมูลชนิดเดียวกันโดยไม่บอกแหล่งที่มา
3. ถ้ามีหลายสถานี ให้เลือกสถานีที่ระยะใกล้ที่สุดและเก็บ `distanceKm`
4. ถ้าไม่มีสถานีในอำเภอ/ตำบล ให้ใช้ Open-Meteo เป็นค่าประมาณและติดป้ายว่าเป็น model estimate
5. อย่าเปลี่ยนกลุ่มความเสี่ยงสุขภาพจาก PM2.5 เพียงอย่างเดียวโดยอัตโนมัติ เว้นแต่มีเกณฑ์ที่ผู้เชี่ยวชาญด้านสาธารณสุขรับรอง
6. เก็บ source และเวลาที่ดึงข้อมูลเพื่อให้ตรวจสอบย้อนหลังได้

## แหล่งอ้างอิง

- Air4Thai/ข้อมูลสถานี: https://naturebi.mnre.go.th/ckan/dataset/air4thai
- DustBoy Open API: https://open-api.cmuccdc.org/
- DustBoy CCDC: https://www.cmuccdc.org/
- Open-Meteo Air Quality API: https://open-meteo.com/en/docs/air-quality-api
- WAQI API: https://aqicn.org/api/
- WAQI Token: https://aqicn.org/data-platform/token/
