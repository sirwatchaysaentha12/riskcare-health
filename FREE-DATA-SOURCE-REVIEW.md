# FREE-DATA-SOURCE-REVIEW.md — ตรวจแหล่งข้อมูล Official 4 แหล่ง (Phase 13)

> ตรวจเมื่อ 2026-10-04 · เปิดอ่านหน้า official จริงทุกแหล่ง · ระดับสถานะตามโจทย์:
> `FREE_DOWNLOAD_AND_LICENSE_REVIEWED` · `FREE_DOWNLOAD_BUT_SCOPE_UNCLEAR` · `RESEARCH_ONLY` · `NOT_CLEARED`
> หลักการ: ไม่ใช้คำว่า "ใช้ฟรี" เพียงเพราะไม่มี paywall — ต้องตรวจ License/Terms ด้วย

## 1. BIDMC PPG and Respiration (PhysioNet) — ✅ FREE_DOWNLOAD_AND_LICENSE_REVIEWED

| ฟิลด์ | ค่า |
|---|---|
| Official URL | https://physionet.org/content/bidmc/1.0.0/ |
| Version | 1.0.0 (2018-06-20, DOI 10.13026/C2208R) |
| Modality | Waveform signals (ไม่มีวิดีโอ) |
| Signal | PPG, impedance respiration, ECG Lead II |
| Reference | **Manual breath annotations (2 annotators อิสระ)** + impedance RR + ECG HR + SpO2 (numerics) |
| File Size | ZIP 207.8 MB (uncompressed 207.7 MB); bidmc_data.mat 28.4 MB; เฉพาะ bidmc_csv เล็กมาก |
| Download Cost | ฟรี (ไม่มีค่าใช้จ่าย/registration) |
| License | **Open Data Commons Attribution License v1.0 (ODC-By)** — quote จากหน้า dataset |
| Competition Use | ✅ ได้ (attribution) — ODC-By อนุญาตเชิงพาณิชย์ |
| Commercial Use | ✅ โดยหลัก license (attribution) |
| Ethics Requirement | deidentified (มาจาก MIMIC-II) — ไม่มีขั้นตอน ethics เพิ่มบนหน้า dataset |
| Storage Requirement | นอก Git — `C:\Users\ACER\research-data\bidmc\` (อนุมัติแล้วใน TRACK-A-APPROVAL-RECORD.md) |
| Deletion Requirement | ไม่ระบุบนหน้า dataset — ตามนโยบายโครงการ (DATA-RETENTION-AND-DELETION.md) |
| **Status** | **FREE_DOWNLOAD_AND_LICENSE_REVIEWED** — อนุมัติ Track A แล้ว |

## 2. Respiratory and heart rate monitoring dataset from aeration study (PhysioNet, 2024) — ⚠️ FREE_DOWNLOAD_BUT_SCOPE_UNCLEAR

| ฟิลด์ | ค่า |
|---|---|
| Official URL | https://physionet.org/content/respiratory-heartrate-dataset/1.0.0/ |
| Version | 1.0.0 (2024-03-20, DOI 10.13026/e4dt-f689) |
| Modality | Pressure/flow (venturi + full-face mask), EIT aeration (32×32), ECG, PPG, HR belt — ไม่มีวิดีโอ |
| Signal | respiratory pressure/flow @100 Hz, EIT @50 Hz, ECG/PPG |
| Reference | ❌ **ไม่มี manually annotated RR reference** — เป็น raw measurement จาก pressure/flow/EIT |
| File Size | ZIP 3.1 GB (uncompressed 5.3 GB) |
| Download Cost | ฟรี, open access |
| License | **CC BY 4.0** (quote จากหน้า) — เชิงพาณิชย์ได้ |
| Competition Use | ✅ ได้ (attribution) |
| Commercial Use | ✅ ได้ (CC BY) |
| Ethics Requirement | University of Canterbury HREC 2023/30/LR-PS อนุมัติ |
| Storage/Deletion | นอก Git · ไม่ระบุ deletion |
| **Status** | **FREE_DOWNLOAD_BUT_SCOPE_UNCLEAR** — license เปิดชัด แต่ **ไม่มี manual RR annotation** และ modality (pressure/flow/EIT) ไม่ตรงกับ Track A โดยตรง → ไม่ใช้ในรอบนี้ |

## 3. OVGU Facial Video Respiratory Rate Database — ❌ NOT_CLEARED

| ฟิลด์ | ค่า |
|---|---|
| Official URL | https://www.nit.ovgu.de/nit/en/AI+research+infrastructure+_+research+databases/International+research+databases/Respiratory+Rate.html |
| Version | สิ่งพิมพ์ 2020 (IEEE Access); หน้าแก้ไข มิ.ย. 2025 — **version ไม่ระบุ** |
| Modality | **RGB facial video** (Pike F-145, ~1.5 m, 25 fps) — 4 คลิป/คน × 3 นาที |
| Signal | วิดีโอใบหน้า (spontaneous + paced breathing 10/15/20 ครั้ง/นาที) |
| Reference | chest belt NeXus NX-RSP1A @512 Hz (sync ด้วย trigger) |
| File Size | ไม่ระบุบนหน้า |
| Download Cost | ไม่ระบุ |
| License | **ไม่ปรากฏบนหน้า** — ติดต่อผู้ดูแล (Marc André Fiedler) |
| Competition/Commercial Use | ไม่ระบุ |
| Ethics Requirement | ไม่ระบุบนหน้า |
| **Status** | **NOT_CLEARED** — license ไม่ปรากฏ (มีวิดีโอจริง แต่ต้องติดต่อขอสิทธิ์ก่อน) |

## 4. Mendeley Data — Video Dataset for Respiratory Rate Counting in Children — ✅ FREE_DOWNLOAD_AND_LICENSE_REVIEWED (เก็บไว้เป็นแหล่งอนาคต)

| ฟิลด์ | ค่า |
|---|---|
| Official URL | https://data.mendeley.com/datasets/72dd3rkttf/2 (DOI 10.17632/72dd3rkttf.2, V2 2025-08-15) |
| Version | 2 |
| Modality | **RGB video ทรวงอก** (Canon EOS M50) — 1 MP4 ต่อเด็ก |
| Signal | วิดีโอทรวงอกเด็ก <5 ปี (บังกลาเทศ — โรงพยาบาล/คลินิกชุมชน) |
| Reference | **Video Expert Panel (VEP)**: นับ RR 2 คนอิสระ, ต่าง >2 เสก third reviewer |
| File Size | ไม่แสดงในหน้า (Files section ไม่แสดงรายละเอียดในการ fetch) |
| Download Cost | ฟรี, เปิดดาวน์โหลด ("freely and openly accessed") |
| License | **CC BY 4.0** (quote จากหน้า) |
| Competition Use | ✅ ได้ (attribution) — CC BY อนุญาตเชิงพาณิชย์ |
| Commercial Use | ✅ ได้ (CC BY) |
| Ethics Requirement | หน้า dataset ไม่แสดง — companion publication (Data in Brief / PMC12918059) มีรายละเอียด ethics ของไซต์บังกลาเทศ — **ต้องอ่านบทความก่อนใช้** |
| Storage/Deletion | นอก Git (หากใช้ในอนาคต) |
| **Status** | **FREE_DOWNLOAD_AND_LICENSE_REVIEWED** — license เปิดชัด แต่**ไม่ใช้ใน Track A รอบนี้** (เป็นวิดีโอ = ตรงกับ camera-domain validation ซึ่งยังไม่ใช่ขอบเขต Track A; และประชากรเป็นเด็กป่วย — ควรผ่าน professional review ก่อน) |

## สรุปการเลือกของ Phase นี้

- **ใช้จริงใน Track A (อนุมัติแล้ว)**: BIDMC — ตรวจ signal processing (`computeBreathingRate`) เทียบ manual breath annotations
- **สำรองอนาคต**: Mendeley Children (วิดีโอ, CC BY) และ aeration study (pressure/flow) — รอ protocol ขยาย
- **NOT_CLEARED**: OVGU (license ไม่ปรากฏ)
