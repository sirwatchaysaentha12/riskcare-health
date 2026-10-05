# EXTERNAL-DATA-SCHEMA.md — โครงสร้างข้อมูลมาตรฐานสำหรับ Dataset ภายนอก

> Phase 9 · สถานะ: นิยาม schema — ยังไม่มีการโหลด/เก็บ dataset จริง · ต่อยอดจาก DATASET-SCHEMA.md (การทดลองกับอาสาสมัคร) และ DATASET-GOVERNANCE-AND-LICENSE-GATE.md

## หลักการ

- ข้อมูลดิบของ dataset ภายนอก (waveform/video) **ไม่เข้า repo** — schema นี้นิยามเฉพาะ "ตาราง metadata + ตารางผล evaluation" ที่จัดเก็บได้
- ทุก record ต้องอ้างกลับ dataset license และ participant-id ของ dataset ต้นทางเสมอ (เพื่อ split ตามบุคคล)

## 1. `external_datasets` — ทะเบียน dataset (ต่อแหล่ง)

```json
{
  "datasetKey": "bidmc_ppg_respiration",
  "officialUrl": "https://physionet.org/content/bidmc/1.0.0/",
  "version": "1.0.0",
  "yearPublished": "2018-06-20",
  "doi": "10.13026/C2208R",
  "licenseName": "Open Data Commons Attribution License v1.0",
  "licenseGate": "CLEARED | RESEARCH-ONLY | NOT CLEARED FOR USE",
  "licenseVerifiedAt": "2026-10-04",
  "citation": "PhysioNet, BIDMC PPG and Respiration v1.0.0",
  "accessRequirement": "open | registration | signed-agreement",
  "participants": 53,
  "signals": ["ppg", "impedance_respiration", "ecg"],
  "referenceGroundTruth": ["rr_manual_breath_annotations", "rr_impedance", "hr_ecg", "spo2"],
  "samplingRates": { "waveformHz": 125, "numericsHz": 1 },
  "environment": "ICU | OR | lab | home-webcam",
  "limitations": ["..."]
}
```

## 2. `external_windows` — หน้าต่างวิเคราะห์ 1 หน่วย (หน่วย = หน้าต่าง 30 วิ ต่อ participant)

```json
{
  "windowId": "bidmc_p0042_w0007",
  "datasetKey": "bidmc_ppg_respiration",
  "participantRef": "bidmc_subject_042",     // id ต้นทางของ dataset — ใช้ split ตามบุคคล
  "split": "train | validation | test",      // กำหนดครั้งเดียวตอนสร้าง — ตามบุคคล
  "windowStartSec": 210.0,
  "windowDurationSec": 30,

  "reference": {
    "rrValue": 16.0,                          // จาก manual breath annotations ในหน้าต่างนี้
    "rrSource": "manual_annotation_two_annotators",
    "hrValue": 78.0,                          // จาก ECG (ถ้ามี)
    "hrSource": "ecg_monitor_1hz",
    "qualityFlags": []                        // artifact/exclusion ตามเอกสาร dataset
  },

  "app": {
    "rrBpm": null,                            // null = quality gate ปฏิเสธ (ห้ามใส่ 0)
    "qualityStatus": "good|acceptable|insufficient|not_assessed",
    "qualityReasons": [],
    "hrBpm": null,
    "hrAlgorithmConfidence": null
  },

  "outcome": "ok | failed | abstained",
  "notes": ""
}
```

**กฎ:** หน้าต่างที่ reference ไม่สมบูรณ์ → บันทึกพร้อม `reference.qualityFlags` + exclude จาก agreement metrics แต่**ยังนับใน Failure/Excluded report** (เทียบ DATASET-SCHEMA.md ของการทดลองอาสาสมัคร)

## 3. `evaluation_runs` — ผลการประเมินแต่ละครั้ง (แนบกับ run ที่วัดจริง)

```json
{
  "runId": "EVAL-2026-…",
  "datasetKey": "bidmc_ppg_respiration",
  "pipelineVersion": "…",                   // จาก MODEL-PROVENANCE.md ณ วันประเมิน
  "signal": "rr | hr",
  "metrics": { "mae": null, "rmse": null, "meanBias": null,
               "blandAltmanLoA": null, "acceptableErrorPct": null,
               "failureRate": null, "abstentionRate": null },
  "n": 0, "nUsed": 0, "nExcluded": 0,
  "confidenceInterval": null,
  "exploratory": true,
  "splitCounts": { "train": 0, "validation": 0, "test": 0 },
  "executedAt": null
}
```

**กฎ:** ต้องรันผ่าน `computeAgreementMetrics()` ของ `validationMetrics.js` เท่านั้น (บังคับ reporting ของ n/nUsed/nMissing/failure/abstention และติดป้าย exploratory อัตโนมัติ) — `metrics.*` เป็น null จนกว่าจะรันจริง **ห้ามใส่ตัวเลขล่วงหน้า**

## 4. การเชื่อมกับระบบภายใน

- `external_windows.app.*` มาจากการรัน pipeline จริง (RrCameraCapture logic + vitallens POS) กับสัญญาณของ dataset — ไม่ใช่การประเมินด้วยมือ
- วิดีโอ/waveform ดิบของ dataset อยู่นอก repo (สิทธิ์ของ dataset ต้นทาง)
- Leakage check ใช้ `assertNoParticipantLeakage()` จาก `validationMetrics.js` กับ `participantRef` ทุกครั้งก่อนรายงาน
