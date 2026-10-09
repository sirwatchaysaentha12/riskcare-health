# PM2.5 Forecast References for Predictive Alert

เอกสารอ้างอิงสำหรับฟีเจอร์ Predictive Alert ซึ่งมีเป้าหมายพยากรณ์ PM2.5 ล่วงหน้า 1–3 วันจากข้อมูลย้อนหลัง ไม่ใช่หลักฐานว่ารูปแบบใดจะเหมาะกับทุกจังหวัด จึงต้องประเมินย้อนหลังกับข้อมูลจริงของพื้นที่ก่อนใช้งานจริง

## งานวิจัยอ้างอิง

### 1. Integrating quantile regression with ARIMA and ANN for interpretable and accurate PM2.5 forecasting in Hat Yai, Thailand

- ลิงก์: https://www.nature.com/articles/s41598-025-27294-1
- สรุป: งานวิจัยใช้ข้อมูล PM2.5 จาก Air4Thai ของสถานีในหาดใหญ่ช่วงปี 2020–2024 และเปรียบเทียบ ARIMA, ANN และโมเดลผสม ARIMA–ANN–QREG โดยรายงานว่าโมเดลผสมช่วยจับทั้งแนวโน้มเชิงเส้น ความไม่เชิงเส้น และความไม่แน่นอนได้ดีขึ้น
- วิธีการ/คำสั่ง: โมเดลฐานในงานคือ ARIMA(1,1,2); บทนำอ้างงานก่อนหน้าว่า ARIMA(1,1,1) เหมาะกับพยากรณ์รายชั่วโมงระยะสั้นถึง 48 ชั่วโมง และ ARIMA(0,1,3) เหมาะกับค่าเฉลี่ย 24 ชั่วโมงในช่วงยาวถึง 31 วัน — ควรตรวจงานต้นฉบับก่อนนำ order ไปใช้กับระบบนี้

### 2. Forecasting of Beijing PM2.5 with a hybrid ARIMA model based on integrated AIC and improved GS fixed-order methods and seasonal decomposition

- ลิงก์: https://pmc.ncbi.nlm.nih.gov/articles/PMC9800338/
- สรุป: เสนอ pipeline แบบ hybrid ที่ใช้ ADF ตรวจ stationarity, ใช้การเลือก order ด้วย AIC ร่วมกับ grid search และแยกองค์ประกอบฤดูกาลก่อนพยากรณ์ เหมาะเป็นแนวทางสำหรับการตรวจสอบข้อมูลและเลือกโมเดลแบบเป็นระบบ
- วิธีการ/คำสั่ง: ไม่ได้กำหนด ARIMA order เดียวที่ควรใช้กับ RiskCARE; order ต้องเลือกจาก series และการประเมินย้อนหลังของพื้นที่เป้าหมาย

### 3. Comparison of ARIMA vs SARIMA for PM2.5 forecasting

- ลิงก์: https://www.researchsquare.com/article/rs-7348600/v1.pdf
- สรุป: ใช้เป็นแหล่งเปรียบเทียบโมเดล ARIMA กับ SARIMA เพื่อพิจารณาว่าฤดูกาล/คาบซ้ำช่วยอธิบาย PM2.5 ได้หรือไม่ ก่อนเลือกโมเดลสำหรับ forecast 1–3 วัน
- วิธีการ/คำสั่ง: แหล่ง PDF ไม่สามารถเปิดยืนยันรายละเอียดเพิ่มเติมผ่านตัวดึงข้อมูลในรอบนี้ได้ จึงยังไม่บันทึก order หรือตัวเลขผลลัพธ์ที่เฉพาะเจาะจง

### 4. Exponential smoothing and ARIMA for PM2.5 forecasting

- ลิงก์: https://arxiv.org/pdf/2309.09579
- สรุป: เปรียบเทียบ ETS/exponential smoothing กับ ARIMA โดยใช้ข้อมูล PM2.5 รายชั่วโมงในกรุงโซล และพิจารณา trend/seasonality ก่อนสร้าง forecast งานรายงานว่า ETS แบบมี trend/seasonality ทำได้ดีกว่า ARIMA ในชุดทดสอบของกรณีศึกษา
- วิธีการ/คำสั่ง: รายงาน ARIMA(2,1,1) สำหรับการวิเคราะห์หนึ่งส่วน และเปรียบเทียบ ETS(A,Ad,A) กับ seasonal ARIMA อีกส่วนหนึ่ง ผลนี้เป็นบริบทของโซล ไม่ควรนำ order ไปใช้กับไทยโดยไม่ backtest

## แหล่งข้อมูลย้อนหลัง

### Air4Thai — กรมควบคุมมลพิษ

- ลิงก์: http://air4thai.pcd.go.th/services/getNewAQI_JSON.php
- รูปแบบข้อมูล: JSON endpoint ตามชื่อบริการ
- ความถี่: payload ของ endpoint ต้องตรวจจาก response จริงและเอกสารบริการก่อนสรุปว่าเป็นรายชั่วโมงหรือค่าเฉลี่ยช่วงใด
- การใช้งานที่เสนอ: เก็บ timestamp, station id, จังหวัด, PM2.5 และข้อมูลคุณภาพที่มาพร้อม response โดยไม่ตีความเป็นค่าเฉลี่ย 24 ชั่วโมงจนกว่าจะยืนยัน field/สัญญา API

### Open Government Data — GDCC Air Pollution

- ลิงก์: https://gdcc.data.go.th/en/dataset/airpollution
- รูปแบบข้อมูล: หน้า dataset อาจมีไฟล์ดาวน์โหลดหลายรูปแบบ เช่น CSV/XLSX หรือ resource API; ต้องเลือก resource จริงและตรวจ schema ก่อนทำ ingestion
- ความถี่: ต้องตรวจ metadata ของ resource ที่เลือก เพราะหน้า dataset อาจรวมข้อมูลหลายชุด/หลายความถี่
- การใช้งานที่เสนอ: ใช้เป็นแหล่ง backfill และตรวจสอบความครบถ้วนของข้อมูลสถานี/จังหวัดเทียบกับ Air4Thai

### กรมควบคุมโรค — Open Data

- ลิงก์: https://opendata.ddc.moph.go.th
- รูปแบบข้อมูล: ต้องตรวจ catalog/resource ของชุด PM2.5 ก่อนระบุว่าเป็น JSON, CSV หรือ XLSX
- ความถี่: เป้าหมายการใช้งานคือข้อมูลรายวันแยกจังหวัดตามที่ระบุในโจทย์ แต่ต้องยืนยันจาก metadata และ field วันที่ของ resource จริง
- การใช้งานที่เสนอ: ใช้เป็นข้อมูลรายวันระดับจังหวัดสำหรับ validation หรือ fallback ไม่ควรผสมกับ series รายสถานีโดยไม่กำหนด aggregation ให้ชัดเจน

## สรุปวิธีที่แนะนำใช้ในโปรเจกต์

1. **Baseline:** Moving Average และ Exponential Smoothing/ETS เพราะนำไปใช้ได้ง่าย อธิบายผลได้ และมีงานวิจัยเปรียบเทียบกับ ARIMA รองรับ
2. **ถ้ามีเวลาพอ:** ทดลอง ARIMA(1,1,1) สำหรับ horizon 1–2 วันตามหลักฐานที่งานหาดใหญ่อ้างถึง และ ARIMA(0,1,3) สำหรับ horizon ยาวกว่า 2 วันเฉพาะเมื่อความถี่/นิยาม target ตรงกับงานอ้างอิง
3. **การเลือกโมเดล:** ทำ rolling-origin backtest แยกจังหวัด/สถานี เปรียบเทียบ MAE, RMSE และ MAPE พร้อมตรวจ missing value, outlier และ seasonality
4. **Python library:** `statsmodels` สำหรับ `ARIMA`, `SARIMAX` และ exponential smoothing; ใช้ `pandas` สำหรับจัดรูป time series และ `scikit-learn` สำหรับ metric/validation
5. **ขอบเขตเฟสแรก:** forecast ค่า PM2.5 ก่อน แล้วค่อย map forecast ไปยังระดับคุณภาพอากาศ/คำเตือนตาม threshold ที่อนุมัติไว้ โดยแสดง timestamp, horizon และแหล่งข้อมูลให้ผู้ใช้เห็น

## ประเด็นที่ต้องยืนยันก่อน implement

- รูปแบบและความถี่จริงของ resource จาก GDCC และ DDC
- ความหมายของ timestamp และค่าเฉลี่ยของ Air4Thai JSON
- ความถี่เป้าหมายของระบบ: รายชั่วโมงหรือรายวัน
- การจัดการข้อมูลขาดหายและการเปลี่ยนสถานีใน series เดียวกัน
- เกณฑ์ยอมรับความคลาดเคลื่อนและวิธีแสดง uncertainty ของ forecast

## Verified live-source checks (2026-09-22)

### Air4Thai live response

The endpoint was fetched successfully with `curl`. The response root is an object with a `stations` array. A representative record was:

```json
{
  "stationID": "119t",
  "nameTH": "สวนสาธารณะธารา",
  "areaTH": "ต.ปากน้ำ อ.เมือง, กระบี่",
  "lat": "8.0506237",
  "long": "98.9180489",
  "AQILast": {
    "date": "2026-09-22",
    "time": "16:00",
    "PM25": { "aqi": "10", "value": "6.0" },
    "AQI": { "aqi": "14", "param": "O3" }
  }
}
```

Field mapping for ingestion:

- Timestamp: `stations[].AQILast.date` + `stations[].AQILast.time`
- PM2.5 concentration: `stations[].AQILast.PM25.value`
- PM2.5 AQI: `stations[].AQILast.PM25.aqi`
- Overall AQI and driving pollutant: `stations[].AQILast.AQI.aqi` and `stations[].AQILast.AQI.param`
- Station identifier: `stations[].stationID`
- Observed frequency: the live payload is the latest station reading; observed timestamps were hourly-looking values such as `15:00` and `16:00`, but the endpoint response alone does not establish a universal sampling schedule or a 24-hour average.

### GDCC download check

The current GDCC page was fetched and its metadata exposes one resource with `format: URL`, `datastore_active: false`, and a Power BI visualization URL:

`https://app.powerbi.com/view?r=eyJrIjoiZmQ1N2FkYzMtYWQwMy00MmQyLWIyMDYtOTJiYjcwNmVjNWMyIiwidCI6ImY2NGQzMTgzLTc2OTEtNGZjYi1hNWVmLTM5ZWJjMDgyYmZmOSIsImMiOjEwfQ%3D%3D`

This is not a CSV/XLSX/JSON data file and the resource has no datastore records available for a reproducible backfill. Therefore no GDCC file was downloaded or inserted into the demo dataset. A downloadable resource or export is still required before running the requested backfill.

## Implementation plan (validated sources)

### Source endpoint and field mapping

- Current source endpoint: `http://air4thai.pcd.go.th/services/getNewAQI_JSON.php`
- Response root: `stations[]`
- Station id: `stations[].stationID`
- Station name/location: `stations[].nameTH`, `stations[].areaTH`
- Province: parse the final province component from `stations[].areaTH`, while retaining the raw location for review
- Timestamp: `stations[].AQILast.date` + `stations[].AQILast.time`
- PM2.5: `stations[].AQILast.PM25.value`
- PM2.5 AQI: `stations[].AQILast.PM25.aqi`
- Overall AQI: `stations[].AQILast.AQI.aqi`; driving pollutant: `stations[].AQILast.AQI.param`
- Live check on 2026-09-22 returned station `119t`, timestamp `2026-09-22 17:00`, PM2.5 `5.9` and PM2.5 AQI `10`.
- History endpoint trial: `http://air4thai.pcd.go.th/services/getHistoryData.php` returned HTTP 404. Do not use it until an official historical endpoint is identified.
- Raw files saved for inspection: `data/raw/air4thai-latest.json` and `data/raw/air4thai-history-response.txt`.

### Model selection and fallback

1. Normalize observations by station and timestamp; reject malformed timestamps and non-numeric PM2.5 values.
2. If fewer than 30 usable historical points exist for a station/province, use Moving Average first and mark the forecast as low-data.
3. Do not fit ARIMA/SARIMA with fewer than 30 usable points. Once enough data exists, compare Moving Average, ETS and candidate ARIMA/SARIMA with rolling-origin backtesting.
4. Keep forecast horizon explicit (`1d`, `2d`, `3d`) and preserve source timestamp, model name, training point count and error metrics in the forecast result.
5. GDCC cannot currently be used for backfill: its CKAN metadata reports one `URL`/Power BI resource, `datastore_active: false`, and no downloadable CSV/XLSX/JSON resource. No GDCC file was placed in `data/raw/` and no backfill was run.

### Paper metrics (comparative references only)

- Nature Hat Yai paper: ARIMA-ANN-QREG reported MAE `1.704` and MAPE `11.782%` on its own Hat Yai dataset. These are comparative reference values only, not acceptance targets for RiskCARE.
- arXiv paper: the test-set RMSE reported for ETS(A,Ad,A) was `5.837`, compared with `7.732` for the ARIMA comparison model. These values come from the Seoul case study and are comparative reference values only.
