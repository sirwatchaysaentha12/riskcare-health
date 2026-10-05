# BIDMC-SPLIT-MANIFEST.md — การแบ่ง Split ตาม Participant (Seed 2026, 60/20/20)

> สร้างโดย `splitByParticipant()` (validationMetrics.js) · ตรวจ `assertNoParticipantLeakage()` ผ่าน · **แบ่งตาม record = ตามคน** (1 record = 1 คน) — ไม่มีการสุ่มตาม frame
> ตรวจซ้ำได้: seed=2026, ratios 0.6/0.2/0.2

## Train — 32 participants
01, 05, 06, 07, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 33, 35, 38, 39, 40, 41, 42, 44, 46, 47, 50, 52

## Validation — 11 participants
04, 09, 11, 12, 23, 31, 37, 45, 48, 49, 51

## Test — 10 participants
02, 03, 08, 24, 30, 32, 34, 36, 43, 53

## การใช้งาน (ตามโจทย์)

- **Phase 13 ไม่มีการ train และไม่มีการปรับ threshold ใด** — รายงานผลรวม (All) เป็นหลัก + per-split เพื่อแสดงความสม่ำเสมอ
- ในอนาคตหาก train candidate model: train เท่านั้นบน Train, ปรับ hyperparameter/calibration บน Validation, รัน Test **ครั้งเดียว**ตอนรายงาน
- Participant หนึ่งคนอยู่หนึ่ง split เสมอ (leakage check ผ่าน) — หน้าต่างทั้ง 16 ของคนเดียวกันอยู่ split เดียวกันทั้งหมด
