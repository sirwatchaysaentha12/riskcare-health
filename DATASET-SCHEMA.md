# DATASET-SCHEMA.md — โครงสร้างข้อมูลชุดตรวจสอบความถูกต้อง

> สถานะ: นิยาม schema — **ยังไม่มีข้อมูลจริง** · อัปเดต 2026-10-04 (Phase 4)
> หลักการ: เก็บน้อยที่สุด · ไม่มีข้อมูลระบุตัวตน · ไม่มี raw video · split ตามบุคคล

## 1. `participants` — ข้อมูลกลุ่มแบบไม่ระบุตัวตน

```json
{
  "participantPseudoId": "P-0007",        // รหัสเทียม (Pseudonymous) — ไม่ใช่ anonymous
  "enrolledAt": "2026-10-20T09:00:00+07:00",
  "ageBand": "35-44",                     // band เท่านั้น ไม่เก็บอายุเต็ม
  "sex": "f| m| other| undisclosed",
  "fitzpatrickType": "I|II|III|IV|V|VI|undisclosed",
  "bmiBand": "18.5-22.9|23-24.9|25-29.9|>=30|undisclosed",
  "splitAssignment": "train|validation|test"   // กำหนดครั้งเดียวตอน enroll ตามบุคคล
}
```

ห้ามมี: ชื่อ, ที่อยู่, อีเมล, เบอร์โทร, รูปถ่าย, วันเกิดเต็ม

## 2. `measurement_sessions` — หนึ่งแถวต่อ "การวัด 1 ครั้ง"

```json
{
  "sessionId": "S-20261020-0001",
  "participantPseudoId": "P-0007",
  "condition": "resting-normal | resting-lowlight | talking | coughing | moving | reading",
  "startedAt": "2026-10-20T09:12:00+07:00",
  "durationSeconds": 30,
  "syncOffsetMs": 120,                    // นาฬิกาอ้างอิง − นาฬิกาอุปกรณ์วัด
  "repetitionIndex": 1,                   // ครั้งที่ 1-3 ของเงื่อนไขนี้
  "retestIntervalMs": null,               // สำหรับคู่ test-retest (เช่น 172800000)

  "reference": {
    "rrMethod": "observer|monitor|null",
    "rrObserver1": 16, "rrObserver2": 16,  // null ถ้าใช้ monitor
    "rrReference": 16,                     // ค่าเฉลี่ย/ค่าอุปกรณ์ (null ถ้า invalid)
    "hrDeviceType": "ecg|monitor|pulse_oximeter|null",
    "hrDeviceModel": "…",                  // รุ่น/ผู้ผลิต (จำเป็นสำหรับ provenance)
    "hrPre": 74, "hrPost": 76, "hrReference": 75,
    "spo2DeviceModel": "…", "spo2Reference": null,  // ใช้ได้เมื่อระบบมีช่องรับค่าภายนอก
    "invalidReasonCode": null              // counter_disagreement | device_error | motion_during_count | …
  },

  "app": {
    "rrBpm": 17,                           // null เมื่อ quality gate ปฏิเสธ
    "rrRawBpm": 17,
    "qualityStatus": "good|acceptable|insufficient",
    "qualityReasons": ["motion:fail"],
    "hrBpm": 78,
    "hrAlgorithmConfidence": 0.93,
    "algorithmVersions": {                 // คัดลอกจาก MODEL-PROVENANCE.md ณ วันเก็บ
      "rr": "tasks-vision UNKNOWN (vendored)",
      "hr": "vitallens 0.6.1 / core 0.2.3"
    }
  },

  "outcome": "ok | failed | abstained",    // abstained = quality gate ปฏิเสธ (พฤติกรรมที่ต้องการในเงื่อนไขท้าทาย)
  "notes": ""
}
```

**ห้ามมีในทุกตาราง**: ไฟล์วิดีโอ/เส้นทางวิดีโอ, ภาพ, ชื่อ/ช่องทางติดต่อ, token/key

## 3. กฎการใช้งาน

- **Split ตามบุคคล**: ใช้ `splitByParticipant()` (validationMetrics.js) — `splitAssignment` ใน participants คือแหล่งความจริง; ทุก session ของคนเดียวอยู่ split เดียวกัน (เช็คด้วย `assertNoParticipantLeakage`)
- **การนับเพื่อรายงาน**: ทุกตารางผลต้องรายงาน `n / nUsed / nMissingReference / nFailed / nAbstained` ตามที่ `computeAgreementMetrics()` คืน
- **เวอร์ชันอัลกอริทึม**: ถ้า app อัปเดตระหว่างเก็บข้อมูล → เพิ่ม `appVersion` field และวิเคราะห์แยกชุด (ห้าม mix โดยไม่ระบุ)
- ค่า SpO2 จาก app ไม่มีใน schema เพราะ local mode ไม่ผลิตค่า — ห้ามเติมค่าลงข้อมูลเอง

## 4. การเก็บจริง (เมื่อผ่าน IRB)

- เก็บนอก repo (เช่น ไฟล์ JSON/CSV บน storage เข้าถึงจำกัด) — **ห้าม** push ขึ้น git
- ทุก export ต้องรัน leakage check ก่อนใช้ (`assertNoParticipantLeakage`)
- ตัวอย่างโครงสร้างไฟล์: `dataset/participants.jsonl`, `dataset/sessions.jsonl`, `dataset/splits.json`
