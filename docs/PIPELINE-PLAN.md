# Plan: Respiratory Signal Pipeline and Features

รอบนี้ทำเฉพาะการวางแผนตามข้อ [1] ใน `_Codex.txt` ยังไม่มีการแก้ source code และจะหยุดรอการยืนยันก่อนเริ่ม implementation

## ไฟล์ที่จะสร้าง/แก้

| ไฟล์ | การเปลี่ยนแปลงและเหตุผล |
|---|---|
| `frontend/src/utils/respiratorySignal.js` | สร้าง pure signal-processing functions สำหรับ resampling, detrending, bandpass, breath detection, features และ quality โดยไม่ผูก DOM/React |
| `frontend/src/pages/BreathingRateCheck.jsx` | เชื่อมการเก็บ motion signal จาก manual ROI chest/neck/abdomen, ค่า duration 30/60 วินาที (ค่าเริ่มต้น 60), actual duration และ waveform canvas เข้ากับหน้าเดิม |
| `frontend/tests/respiratorySignal.test.mjs` | เพิ่ม unit tests ด้วย `node:test` ที่โปรเจกต์มีอยู่แล้ว สำหรับ sine/noise/ช่วงนิ่งและ edge cases |
| `docs/CAMERA-MANUAL-TEST.md` | ปรับ checklist ให้ทดสอบ ROI, waveform, duration และความต่างระหว่างผลสาธิตกับการนับมือได้หลัง implementation |
| `docs/SPEC-GAP-REPORT.md` | ปรับสถานะรายการที่เกี่ยวกับ signal pipeline/features และคำนวณเปอร์เซ็นต์ใหม่ด้วยวิธีเดิมจาก 22 รายการ |

จะไม่แก้ `vite.config.js`, dependency/package files, API/Backend, database, auth, patient data schema, clinical labels, risk model, risk threshold หรือส่วนอื่นที่ไม่จำเป็น และจะไม่แก้ `docs/RESPIRATORY-RISK-SPEC.md` ซึ่งเป็นข้อกำหนดอ้างอิง

## Function signatures ที่วางแผน

สัญญาณดิบใช้ `{ tMs: number, value: number | null }` โดย `tMs` เป็น timestamp milliseconds จากนาฬิกา monotonic; `null` หมายถึง frame/sample ขาดหาย ไม่ใช่ค่าศูนย์ ส่วน signal amplitude อยู่ในหน่วย normalized grayscale/landmark displacement ตามแหล่ง ROI และต้องไม่ตีความเป็นหน่วยกายภาพ

```ts
resampleSignal(
  series: TimedSample[],
  actualFps: number, // FPS ที่วัดจาก timestamp ไม่ใช่ค่าที่ request กล้อง
  targetFps: number
): { series: Array<number | null>, fs: number } // fs = Hz ของ uniform output grid

detrend(series: Array<number | null>): Array<number | null>

bandpassFilter(
  series: Array<number | null>,
  fs: number, // samples/second = Hz
  low = 0.1, // Hz
  high = 1.0, // Hz
  order = 4
): Array<number | null>

detectBreaths(
  series: Array<number | null>,
  fs: number // Hz
): Array<{
  startIdx: number, peakIdx: number, endIdx: number,
  tInsp: number, tExp: number, amplitude: number
}> // tInsp/tExp เป็นวินาที; amplitude เป็นหน่วยเดียวกับ input signal

computeRR(
  breaths: Breath[], durationSec: number // วินาทีที่วัดจริง
): { rrMean: number | null, rrStd: number | null, rrMin: number | null, rrMax: number | null } // ครั้ง/นาที

computeDutyCycle(breaths: Breath[]): number | null // อัตราส่วน 0–1

computeVariability(breaths: Breath[]): number | null // normalized CV 0–1 ตามสูตรที่จะระบุและทดสอบ

detectApneaHypopnea(
  series: Array<number | null>, fs: number, breaths: Breath[]
): { apneaCount: number | null, hypopneaCount: number | null }

computeSignalQuality(
  series: Array<number | null>, fs: number, breaths: Breath[]
): number | null // score 0–1; ใช้ SNR, missing-frame ratio และ amplitude regularity

extractFeatures(
  rois: { chest?: TimedSample[], neck?: TimedSample[], abdomen?: TimedSample[] },
  durationSec: number // วินาทีที่วัดจริง
): RespiratoryFeatures // ฟิลด์ตาม schema; ค่าที่คำนวณไม่ได้เป็น null และมี unavailable_reason
```

จะเพิ่ม helper ภายในโมดูลสำหรับวัด FPS จาก timestamp และตรวจข้อมูลพอ/ไม่พอ โดยไม่อ่าน camera setting มาอ้างเป็น FPS จริง การ resample ต้องรักษาช่วงขาดหายไว้เป็น missing markers เพื่อให้ quality score นับ frame loss ได้

## วิธีเชื่อม ROI และ UI

- ใช้ manual normalized boxes (0–1) สำหรับ chest, neck, abdomen ก่อน; ผู้ใช้ต้องจัดตำแหน่งเองและเห็นกรอบบน preview
- สกัด motion trace จากภาพ grayscale ในแต่ละ ROI ต่อ frame; ไม่เก็บหรืออัปโหลดภาพ/video
- เก็บ trace ใน memory ตามเวลาจริง; แสดง waveform หลัง bandpass บน canvas ธรรมดา พร้อม marker peak ที่ตรวจได้
- duration selector มี 30/60 วินาทีและ default 60; `durationSec` ของผลคำนวณมาจาก timestamp เริ่ม/หยุดจริง แม้หยุดก่อนครบ
- หากมีเฉพาะ chest ให้คืน multi-ROI indices เป็น `null` พร้อม `unavailable_reason`; ห้ามอนุมานค่าระหว่าง ROI

## สิ่งที่ยังทำไม่ได้ในรอบนี้ และเหตุผล

- **ยังไม่เริ่ม implementation:** ข้อกำหนดกำหนดให้หยุดรอการยืนยันหลังสร้างแผนนี้
- **ยังไม่สร้าง disease-risk score/API, diagnosis, severity หรือ physician workflow:** อยู่นอกขอบเขตข้อ 3/4 และไม่มี validation ทางคลินิก
- **ยังไม่ยืนยันความหมายทางคลินิกของ apnea/hypopnea thresholds หรือ signal-quality cutoff:** ต้องมี protocol/reference และการทบทวนผู้เชี่ยวชาญ; ตัวตรวจใน prototype ทำได้เพียง candidate low-motion segments
- **ยังไม่อ้างว่าคลาดเคลื่อน ±2 ครั้ง/นาทีหรือมี clinical accuracy:** tests ที่ร้องขอเป็น synthetic unit tests ไม่ทดแทน reference measurement
- **ยังไม่ยืนยันการจับสัญญาณผ่านเสื้อผ้าหรือการแยก chest/abdomen จริง:** manual ROI จาก RGB มีข้อจำกัดและต้องทดสอบบนอุปกรณ์/สภาพแสงจริง
- **ยังไม่ลบหรือเปลี่ยน `frontend/src/utils/breathingRate.js`:** จะคง helper/tests เดิมไว้ก่อน เพื่อลดผลกระทบ; แผน integration จะเรียกโมดูลใหม่จากหน้าประเมินเฉพาะเมื่อได้รับอนุมัติ

## เงื่อนไขก่อนเริ่มข้อ [2]

ต้องยืนยันก่อนว่าจะให้เริ่ม implementation ตามไฟล์และ signatures ข้างต้น หากต้องเปลี่ยนขอบเขตหรือเพิ่ม dependency จะหยุดถามก่อน ไม่ติดตั้ง package ใหม่ในแผนนี้
