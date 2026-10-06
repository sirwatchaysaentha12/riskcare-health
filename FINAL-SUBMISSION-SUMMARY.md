# FINAL-SUBMISSION-SUMMARY.md — สรุปตัวเลขจริงทั้งหมดสำหรับกรรมการ (Freeze 06 ต.ค.)

> **นิยามระบบ**: "ระบบต้นแบบเพื่อประเมินสัญญาณเบื้องต้น ตรวจคุณภาพการวัด และจัดทำข้อมูลประกอบการพิจารณาของบุคลากรทางการแพทย์"
> **ไม่ใช่เครื่องมือวินิจฉัย · ไม่ใช่ medical-grade · ยังไม่ผ่านการยืนยันทางคลินิก**

## ระบบที่ 1 — PM2.5 Forecast (ML v3.0 production)

| Metric | ค่าจริง (holdout test) |
|---|---|
| **MAE (h=1)** | **1.96 µg/m³ (≤2 ✅)** |
| **±5 accuracy (h=1)** | **93.8%** |
| **±3 (persistence baseline)** | h1 = 78% · h2 = 57% · h3 = 52% |
| ±2 accuracy (h=1) | 62.4% — **ต่ำกว่าเป้าหมาย 87% ที่ตั้งไว้ (พูดตรง ๆ: ±2 ที่ความมั่นใจสูงทำไม่ได้ จึงนำเสนอ MAE≤2 + ±5 แทน)** |
| Production | deploy แล้ว (ml-local-v3.0 → pm25_forecast_daily, cron 04:30) |

**ข้อจำกัดที่ต้องพูดตรง ๆ**: ทำนายได้ลึกสุด h=72 และความแม่นลดลงตามระยะ · โมเดล train จากข้อมูลสถานีวัดจริง ไม่ใช่ทุกพื้นที่

## ระบบที่ 2 — Respiratory 3-Signal Assessment (Prototype)

| Metric | ค่าจริง (BIDMC Track A — **Signal Processing Only, ไม่ใช่ Camera Accuracy**) |
|---|---|
| Dataset | BIDMC/PhysioNet v1.0.0 — 53 ICU records, manual breath annotations |
| Windows | 842 สร้าง / **484 ใช้จริง** (abstention 42.4%) |
| Split | 32/11/10 **ตาม participant** (leakage check ผ่าน) |
| QC | **10/10 PASS** |
| **MAE** | **9.03 ครั้ง/นาที** (95% CI 8.49-9.54) |
| RMSE | 10.74 |
| **Mean Bias** | **+8.92** (overcount เป็นระบบ — cardiogenic artifact บน impedance) |
| Median AE | 10 |
| **Acceptable Error ±2** | **20.7%** |
| Failure / Abstention | 0.1% / 42.4% |
| **Camera Accuracy** | **Not Validated** (BIDMC ไม่มีวิดีโอ) |
| **Clinical Accuracy** | **Not Validated** |
| **Real Participant Data** | **NO — REQUIRES PROFESSIONAL REVIEW** |

**ข้อจำกัดที่ต้องพูดตรง ๆ**:
1. **ผล Track A เป็นผลลบ** — peak counting พารามิเตอร์ default ใช้กับ impedance ไม่ได้ (overcount +8.92 จาก cardiogenic artifact) — ต้องวิจัยต่อ (filter) ใน research branch
2. **ยังไม่พิสูจน์ camera accuracy** — ต้องมี dataset วิดีโอที่มี reference (Mendeley Children CC BY อยู่ในคิว)
3. **SpO2 ไม่มีข้อมูลใน local mode** — แสดง Missing ตลอด ไม่สร้างค่าทดแทน
4. **Generalization/Fairness ยังพิสูจน์ไม่ได้** · ยังไม่ทดสอบอาสาสมัครจริง

## คุณภาพกระบวนการ (พิสูจน์ด้วยการรันจริง)

- Unit 15 suites = **120/120** · E2E = **40/40** · Build 2 แอป **ผ่าน** · Lint **exit 0**
- Security: รหัสผ่านเดิมของบัญชีทดสอบ หมดจาก repo (env-based credential + Safe Error) · ไม่มี key/PII/dataset ใน Git
- Privacy by design: consent ก่อนกล้อง, raw video ไม่เก็บ, temp ลบทุกครั้ง, error redaction
- โครงสร้าง commit: content commit `7236ddd` (mixed-scope — ขอบเขตตาม RESPIRATORY-STAGING-LIST.txt) + corrective `18b66de` + security `f79a5b5`

## สถานะ

**Demo Ready = YES · Submission Ready = YES · Clinical Ready = NO · Public Release Ready = CONDITIONAL · Professional Review = REQUIRED · Real Participant Data = NO**
