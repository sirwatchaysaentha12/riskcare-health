# BIDMC-QC-REPORT.md — ผล Quality Control ก่อนใช้ข้อมูล (รันจริง 2026-10-04)

> สคริปต์: `scripts/bidmc-qc-validate.mjs` · ข้อมูล: 159 ไฟล์ CSV, 53 subjects (146.2 MB)
> Manifest: `C:\Users\ACER\research-data\bidmc\manifest.json` (SHA-256 ต่อไฟล์)

## ผล QC 10 รายการ (ตามโจทย์)

| # | รายการ QC | วิธีตรวจ | ผล |
|---|---|---|---|
| 1 | File Integrity | ไฟล์ครบ 159/159, CSV parse ได้ทุกไฟล์, SHA-256 บันทึกครบ (manifest.json) | ✅ PASS |
| 2 | Duplicate Recording | SHA-256 ของ Signals.csv ทั้ง 53 ไฟล์ — ไม่มี hash ซ้ำ | ✅ PASS (0 ซ้ำ) |
| 3 | Missing Annotation | ตรวจ Breaths.csv ทุก subject — ทุกไฟล์มี annotation ≥1 | ✅ PASS (0 หาย) |
| 4 | Invalid RR | Numerics RESP ทุก subject อยู่ในช่วง 0-60 ครั้ง/นาที | ✅ PASS (0 ผิดปกติ) |
| 5 | Unit Mismatch | RESP (impedance) เป็นค่า normalize (~0-1) ใช้กับ peak counting รูปร่างสัมพัทธ์; RR เป็นครั้ง/นาที; annotation เป็น sample index @125 Hz — หน่วยสอดคล้องกับวิธีคำนวณ | ✅ PASS (แปลงหน่วยถูกต้อง: annotation index → จำนวน breath ×2 = RR) |
| 6 | Sampling Rate | median Δt ของ Times = 0.008 s (125 Hz) ทุก subject | ✅ PASS (0 ผิดปกติ) |
| 7 | Timestamp Alignment | time เริ่มที่ 0, Δt สม่ำเสมอ; annotation sample index ตรงกับ row ของ Signals | ✅ PASS |
| 8 | Signal Dropout | ตรวจช่วงเวลาข้าม >1 s / ค่า RESP ว่างทุก subject | ✅ PASS (0 dropout) |
| 9 | Participant ID | ครบ bidmc_01 … bidmc_53 = 53 records | ✅ PASS |
| 10 | Impossible Values | breath intervals / RR numerics / ค่า RESP ไม่พบค่า impossible | ✅ PASS |

**สรุป QC: 10/10 PASS — ไม่มีไฟล์ต้อง exclude ด้วยเหตุ QC**

## ข้อสังเกตเชิงสัญญาณ (ไม่ใช่ QC fail — สำคัญต่อการตีความผล)

- สัญญาณ impedance respiration มี**cardiogenic artifact** (การเต้นของหัวใจซ้อนบนคลื่นหายใจ) เป็นลักษณะทางฟิสิกส์ของ impedance — ผลกระทบต่อ peak counting รายงานใน TRACK-A-OFFLINE-VALIDATION-REPORT.md
- Abstention ของ gate (periodicity/CV) บนสัญญาณนี้สูง (ดูรายงาน validation) — พฤติกรรมที่ควรคาดหวังเมื่อ gate ออกแบบกับสัญญาณไหล่
