# MODEL-PROVENANCE.md — แหล่งที่มาและเวอร์ชันของโมเดล/ไลบรารีในระบบประเมินความเสี่ยงทางเดินหายใจ

> อัปเดต: 2026-10-04 (Phase 3) · ทุกตัวเลขด้านล่าง **ตรวจจากแพ็กเกจ/ไฟล์จริงในเครื่อง** ไม่ใช่การเดา
> หากตรวจไม่ได้ ระบุเป็น `UNKNOWN` พร้อมสิ่งที่ต้องตรวจเพิ่ม · ไฟล์นี้**ห้าม**มี API key หรือ secret

## 1. สัญญาณที่ 1 — อัตราการหายใจ (RR)

| รายการ | ค่า | หลักฐาน |
|---|---|---|
| ไลบรารี | MediaPipe Tasks Vision (`vision_bundle.mjs` + `wasm/`) — vendored offline ที่ `frontend/public/mediapipe/` | ไฟล์ใน repo |
| เวอร์ชัน tasks-vision | **UNKNOWN** — ไฟล์ vendored ไม่มี version string ฝังอยู่ (ตรวจด้วยการ grep version pattern แล้ว) | ต้องตรวจเพิ่ม: บันทึก origin ของการดาวน์โหลดชุด `public/mediapipe/` (ไฟล์ดาวน์โหลด 1 ต.ค. 2026) หรือ re-download จาก npm `@mediapipe/tasks-vision` เพื่อเทียบ hash |
| โมเดล | `pose_landmarker_lite.task` (5.5 MB) | ไฟล์ใน repo |
| โมเดลเวอร์ชัน/ไลเซนส์ | Google MediaPipe Pose Landmarker lite — ไลเซนส์ upstream Apache 2.0; **เวอร์ชันย่อยของไฟล์ .task: UNKNOWN** | ต้องตรวจเพิ่ม: บันทึก URL ต้นทางตอนดาวน์โหลดไฟล์ .task |
| อัลกอริทึม RR | นับ peak ของสัญญาณ y-ไหล่ + periodicity gate (autocorr ≥ 0.35) + interval CV gate (≤ 0.6) + plausibility 6–40 ครั้ง/นาที | `frontend/src/utils/breathingRate.js` |
| วิธีวิเคราะห์ | client-side ทั้งหมด (วิดีโอไม่ออกจากเครื่องในขั้น RR) | โค้ด |

## 2. สัญญาณที่ 2 — อัตราการเต้นหัวใจ (HR) และ SpO2

| รายการ | ค่า | หลักฐาน |
|---|---|---|
| แพ็กเกจ | vitallens **0.6.1** (MIT, © 2026 Rouast Labs, author Philipp Rouast) | `pip show vitallens` + LICENSE ใน dist-info |
| core | vitallens-core **0.2.3** (MIT, © 2026 Rouast Labs — ไบนารี .pyd ปิดซอร์ส แต่ไลเซนส์ MIT) | LICENSE ใน `vitallens_core-0.2.3.dist-info/licenses/` |
| อัลกอริทึมที่ใช้ | **POS local mode** (POS algorithm, Wang et al. 2017) — รันในเครื่อง ไม่ใช้ API key ไม่ติดต่อเน็ต | `vitallens/methods/pos.py` + docstring `client.py:65` |
| สัญญาณที่ได้ | **heart_rate เท่านั้น** — `supported_vitals=["heart_rate"]` hard-coded ที่ `pos.py:38` → **SpO2/RR สร้างไม่ได้ในโหมด local** | ซอร์สโค้ดแพ็กเกจ |
| face detector | Ultra-Light-Fast-Generic-Face-Detector-1MB (`model_rfb_320.onnx`, MIT © 2019 linzai) | LICENSE ใน `vitallens/models/...` |
| confidence | เป็นค่าภายในอัลกอริทึม **ไม่ใช่ clinical accuracy** (ทดสอบจริง: ให้ conf 1.0 กับคลิป AI-generated) | การทดสอบ 3 ต.ค. 2026 |
| คำประกาศของผู้ผลิต | "estimates are not intended for any medical purposes" (ฝังในทุก response) | message จากผลรัน |

## 3. Runtime / Tooling

| รายการ | ค่า | หลักฐาน |
|---|---|---|
| onnxruntime (python) | **1.30.0** (MIT, Microsoft) | `pip show onnxruntime` |
| prpy | **0.4.4** (MIT) | `pip show prpy` |
| ffmpeg | **7.1.1** essentials build, GyanD (Windows) — เก็บที่ `admin-app/server/bin/` (gitignored) | ชื่อ release ที่ดาวน์โหลด (github.com/GyanD/codexffmpeg 7.1.1) |
| บทบาท ffmpeg | normalize วิดีโอ webm (VFR) → CFR mp4 ก่อนป้อน vitallens เท่านั้น | `admin-app/scripts/vital_signs_runner.py` |

## 4. การประเมินความเสี่ยง (Scoring)

| รายการ | ค่า |
|---|---|
| อัลกอริทึม | rule-based weighted scoring เกณฑ์ WHO/CDC (RR 12–20, SpO2 95/90, HR 60–100) + คะแนนแบบประเมินเดิม (เกณฑ์ 5/10/16 + red flag ของ Assessment.jsx) |
| ไฟล์ | `frontend/src/utils/respiratoryRiskScore.ts` |
| สถานะการตรวจสอบ | **not-validated** — ยังไม่ผ่านการเทียบกับอุปกรณ์อ้างอิงทางการแพทย์ |

## 5. สถานะรวมของระบบ

- ระบบนี้เป็น **Prototype คัดกรองเบื้องต้น** — ไม่ใช่เครื่องมือวินิจฉัย ไม่ใช่ medical device
- ข้อความบังคับทุกผลลัพธ์: "ยังไม่ผ่านการยืนยันความถูกต้องทางคลินิก และใช้ได้เฉพาะ Prototype/ข้อมูลประกอบเท่านั้น"
- Clinical Accuracy ถูก fix เป็น `not-validated` ใน measurement contract (`measurementContract.js`) จนกว่าจะมีผลเทียบอุปกรณ์อ้างอิงจริง
