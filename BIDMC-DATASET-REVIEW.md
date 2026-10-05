# BIDMC-DATASET-REVIEW.md — บันทึกการใช้ BIDMC จริง (Track A)

> ดาวน์โหลดจริง 2026-10-04 ภายใต้การอนุมัติ Track A (TRACK-A-APPROVAL-RECORD.md)

## ข้อมูล dataset

| ฟิลด์ | ค่า |
|---|---|
| Official URL | https://physionet.org/content/bidmc/1.0.0/ (ยืนยันซ้ำก่อนดาวน์โหลด) |
| Version | 1.0.0 (2018-06-20, DOI 10.13026/C2208R) |
| License | Open Data Commons Attribution License v1.0 (ODC-By) |
| Access | Open — ไม่มี registration/ค่าดาวน์โหลด |
| Modality | Waveform signals — **ไม่มี RGB video** |
| สัญญาณที่ดาวน์โหลดมาใช้ | `bidmc_##_Signals.csv` (Time, RESP = impedance respiration, PLETH, V, AVR, II @125 Hz), `bidmc_##_Breaths.csv` (manual breath annotations — sample index @125 Hz, 2 annotators), `bidmc_##_Numerics.csv` (HR/Pulse/RESP/SpO2 @1 Hz) |
| ไฟล์ที่ดาวน์โหลด | 159 ไฟล์ (53 subjects × 3) = 146.2 MB |
| Storage | `C:\Users\ACER\research-data\bidmc\bidmc_csv\` — **นอก Git** + manifest.json (SHA-256 ต่อไฟล์) |
| Download Cost | ฟรี |
| Competition Use | ✅ ได้ (attribution: PhysioNet, DOI 10.13026/C2208R) |
| Commercial Use | ✅ โดยหลัก ODC-By |
| Ethics Requirement | deidentified (มาจาก MIMIC-II) — ไม่มีขั้นตอนเพิ่มบนหน้า dataset |
| Deletion Requirement | ไม่ระบุบนหน้า — ตามนโยบายโครงการ (ลบเมื่อเลิกใช้) |
| ข้อจำกัด | ผู้ป่วย ICU, ไม่มีวิดีโอ, annotation ผูกกับคุณภาพ impedance signal |
| **สถานะ** | **FREE_DOWNLOAD_AND_LICENSE_REVIEWED — ใช้งานจริงแล้ว (Track A)** |

## ข้อสังเกตจากการใช้จริง

- CSV รายไฟล์ดาวน์โหลดผ่าน `physionet.org/files/` ตรง ๆ (ZIP เต็ม 207 MB ช้าบนเครือข่ายนี้ — ดาวน์โหลดเฉพาะ CSV ที่ Track A ต้องใช้ 159 ไฟล์)
- Signals.csv: 8 นาที × 125 Hz ≈ 60,000 แถว/ไฟล์ (~2.7 MB)
- RESP column เป็นค่า impedance ที่ normalize แล้ว (~0-1) — peak counting ใช้รูปร่างสัมพัทธ์ได้
- Breaths.csv: header "breaths ann1 [signal sample no], breaths ann2 [signal sample no]" — sample index @125 Hz ตรงกับ row ของ Signals.csv
