# EXTERNAL-DATASET-REVIEW.md — การตรวจ Dataset ภายนอกจากแหล่ง Official (8 แหล่ง)

> Phase 9 · ตรวจเมื่อ: **2026-10-04** · วิธี: เปิดอ่านหน้า Dataset/Documentation/License จริงด้วยเว็บ fetch (ไม่ใช่ snippet เพียงอย่างเดียว)
> สถานะ License: **CLEARED** = ผ่านการตรวจและใช้ได้ (ระบุเงื่อนไข) · **NOT CLEARED FOR USE** = license ไม่ชัด/ต้องเซ็นข้อตกลง/ตรวจไม่ได้
> การแข่งขัน (Competition) = การใช้เชิงพาณิชย์-เทียบเคียงได้ (มีการแข่ง/รางวัล) — จึงต้องเข้มกว่า research ล้วน

## สรุปผลอันดับแรก

| Dataset | License Gate | ใช้เพื่อวิจัยภายใน | ใช้ในการแข่งขัน |
|---|---|---|---|
| BIDMC PPG and Respiration (PhysioNet) | ✅ CLEARED (ODC-By 1.0, open access) | ได้ | **ได้** (แสดง attribution) |
| MIMIC-III Waveform (PhysioNet) | ✅ CLEARED (ODbL 1.0, open access) — ⚠️ share-alike | ได้ | **ได้** (แสดง attribution + สืบทอด license กับ derivative DB) |
| VitalDB | ⚠️ RESEARCH ONLY (CC BY-NC-SA 4.0 + DUA) | ได้ | **ไม่ได้** (non-commercial) |
| COHFACE (Idiap/Zenodo) | ⚠️ RESEARCH ONLY (non-commercial EULA, ต้องยื่นขอ) | ได้ (หลังอนุมัติ) | **ไม่ได้** |
| PURE (KIT→TU Ilmenau) | ❌ NOT CLEARED FOR USE (ต้องเซ็นข้อตกลง, หน้า official เดิมปิด) | ได้หลังเซ็น | **ไม่ได้** |
| WESAD (UCI ML Repository) | ❌ NOT CLEARED FOR USE (license = "see linked dataset" — ไม่พบข้อความ license ชัดเจนบนหน้าที่ตรวจ) | ได้หลังตรวจ license ต้นทาง | **ไม่ได้ (ยัง)** |
| CapnoBase | ❌ NOT CLEARED FOR USE (เว็บตรวจไม่ได้ 2 ครั้ง — timeout) | ไม่ได้ (ยัง) | **ไม่ได้** |
| UBFC-rPPG | ❌ NOT CLEARED FOR USE (หน้า official เป็น login-wall — ตรวจ license ไม่ได้) | ไม่ได้ (ยัง) | **ไม่ได้** |

---

## รายละเอียดราย dataset

### 1. BIDMC PPG and Respiration Dataset — ✅ CLEARED
- **Official URL**: https://physionet.org/content/bidmc/1.0.0/
- **ผู้ดูแล**: PhysioNet (Beth Israel Deaconess Medical Centre, Boston)
- **Version/ปี**: 1.0.0, published 2018-06-20 (DOI 10.13026/C2208R)
- **จำนวน Participant**: 53 recordings (ผู้ป่วยวิกฤต ICU), คนละ 8 นาที
- **Signal**: PPG, impedance respiration, ECG Lead II (125 Hz) + numerics (RR/HR/SpO2 @1 Hz)
- **Ground Truth**: RR จาก impedance respiration + **manual breath annotations โดย 2 annotators อิสระ**; HR จาก ECG
- **Sampling Rate**: waveform 125 Hz; numerics 1 Hz
- **Device/Environment**: hospital monitors (ICU)
- **License**: **Open Data Commons Attribution License v1.0 (ODC-By)** — อ้างอิงคำบนหน้า dataset
- **Access Requirement**: เปิดกว้าง — ไม่ต้อง credentialing/CITI
- **Commercial/Competition Use**: ODC-By อนุญาตใช้เชิงพาณิชย์โดยให้ attribution (ควรอ่าน license file ก่อนใช้จริง)
- **Ethics Requirement**: มาจาก MIMIC-II (deidentified) — หน้า dataset ไม่แสดงข้อความ ethics เพิ่ม
- **ข้อจำกัด**: ตัวอย่างน้อย (53×8 นาที), ผู้ป่วย ICU ไม่ใช่ประชากรทั่วไป, annotation ผูกกับคุณภาพ impedance signal
- **เหมาะ Train/Validation/Test**: ใช้ได้ทั้งหมด (แบ่ง **ตามผู้ป่วย**) — เหมาะเป็น **validation หลักของ RR** เพราะมี manual breath annotations
- **วันที่ตรวจสอบ**: 2026-10-04

### 2. MIMIC-III Waveform Database — ✅ CLEARED (share-alike)
- **Official URL**: https://physionet.org/content/mimic3wdb/1.0/
- **ผู้ดูแล**: PhysioNet (MIT Laboratory for Computational Physiology)
- **Version/ปี**: 1.0, published 2020-04-07 (DOI 10.13026/c2607m)
- **จำนวน Participant**: 67,830 record sets (~30,000 ICU patients); matched subset ~22,000 recordings/10,000 patients
- **Signal**: ECG, ABP, fingertip PPG, respiration (≤8 signals, 125 Hz) + numerics (HR/RR/SpO2/NIBP)
- **Ground Truth**: monitor-derived numerics; clinical data ผ่าน matched MIMIC-III Clinical (แยกต้องขอสิทธิ์เพิ่ม)
- **Sampling Rate**: waveform 125 Hz; numerics 1 Hz/1 นาที
- **Device/Environment**: ICU bedside monitors
- **License**: **ODbL v1.0** — ตรวจจากหน้า dataset
- **Access Requirement**: เปิดกว้าง (waveform) — matched clinical data ต้องขอแยก
- **Commercial/Competition Use**: ODbL อนุญาตเชิงพาณิชย์ + attribution + **share-alike** (derivative DB ต้องใช้ license เดียวกัน)
- **Ethics Requirement**: IRB อนุมัติ (BIDMC + MIT), consent waived (deidentified)
- **ข้อจำกัด** (จาก Technical Limitations บนหน้า): signal หาย/ขาดได้, inter-waveform alignment คลาดเคลื่อน ≤500 ms (rPPG quality ต่ำในบาง record), ECG bit-depth ต่ำ
- **เหมาะ Train/Validation/Test**: ได้ (ตามผู้ป่วย) — ใหญ่พอเป็น **training pool ของ RR/HR candidate model** แต่ต้อง QC หนัก (alignment jitter)
- **วันที่ตรวจสอบ**: 2026-10-04

### 3. VitalDB — ⚠️ RESEARCH ONLY
- **Official URL**: https://vitaldb.net/dataset/
- **ผู้ดูแล**: Seoul National University Hospital (Lee HC et al., Sci Data 2022;9:279, NCT02914444)
- **Version/ปี**: Open dataset (บทความ 2022)
- **จำนวน Participant**: 6,388 surgical cases (non-cardiac)
- **Signal**: ECG II/V5 (500 Hz), PPG PLETH (500 Hz), **CO2 waveform/capnography (62.5 Hz)** + ETCO2/SpO2/PR numerics
- **Ground Truth**: capnography-derived RR + monitor HR/SpO2 + >60 clinical variables
- **Sampling Rate**: 500 Hz (monitor), 62.5 Hz (CO2), numerics 1-7 วินาที
- **Device/Environment**: operating rooms (SNUADC monitors, Primus anesthesia machine)
- **License**: **CC BY-NC-SA 4.0** + Data Use Agreement
- **Access Requirement**: ฟรีผ่านเว็บ แต่มี DUA (ใช้เพื่อวิจัย/พัฒนาเท่านั้น, รายงาน misuse ใน 24 ชม., ห้าม re-identify)
- **Commercial/Competition Use**: **ไม่อนุญาต** (NonCommercial)
- **Ethics Requirement**: IRB อนุมัติ (H-1408-101-605)
- **ข้อจำกัด**: single center, non-cardiac surgery เท่านั้น, บาง device มีใน subset เล็ก
- **เหมาะ Train/Validation/Test**: วิจัยภายในได้ (RR จาก capnography เป็น reference คุณภาพสูง) — **ห้ามใช้ผลในการแข่งขัน/เชิงพาณิชย์**
- **วันที่ตรวจสอบ**: 2026-10-04

### 4. COHFACE — ⚠️ RESEARCH ONLY
- **Official URL**: https://www.idiap.ch/dataset/cohface + https://zenodo.org/record/4081054
- **ผู้ดูแล**: Idiap Research Institute (Heusch, Anjos & Marcel)
- **Version/ปี**: 2016 (Zenodo record 4081054)
- **จำนวน Participant**: 40 subjects (12 หญิง/28 ชาย), 160 คลิป 1 นาที
- **Signal**: RGB webcam video (Logitech C525, 640×480 @ 20 Hz) + BVP/breathing (BioGraph Infiniti)
- **Ground Truth**: BVP + breathing rate จาก Thought Technology devices
- **Sampling Rate**: video 20 Hz; สัญญาณอ้างอิงตามอุปกรณ์ BioGraph
- **Device/Environment**: **webcam บ้านผู้เข้าร่วม** — ใกล้สภาพใช้งานจริงที่สุดในชุดนี้
- **License**: **COHFACE EULA — non-commercial เท่านั้น** (Zenodo: "subject to a dedicated non-commercial EULA sent after application")
- **Access Requirement**: ไฟล์ restricted — ต้อง login + ยื่นคำขอโดยผู้มีตำแหน่งถาวร (อีเมลองค์กร; ห้าม gmail)
- **Commercial/Competition Use**: **ไม่อนุญาต**
- **Ethics Requirement**: ไม่แสดงบนหน้า (อยู่ใน EULA)
- **ข้อจำกัด**: ต้องยื่นขอ, อัตราเฟรม 20 Hz ต่ำ, citation บังคับ (arXiv:1709.00962)
- **เหมาะ Train/Validation/Test**: วิจัยภายในได้หลังอนุมัติ — เหมาะ **domain-shift/subgroup testing** (webcam จริง)
- **วันที่ตรวจสอบ**: 2026-10-04

### 5. PURE (Pulse Rate) — ❌ NOT CLEARED FOR USE
- **Official URL**: หน้าเดิมของ KIT (`ttl.ait.kit.edu`) **ไม่พบแล้ว** (DNS ล้ม); ปัจจุบันสิทธิ์ย้ายไป TU Ilmenau — ต้องส่งอีเมล `nikr-datasets-request@tu-ilmenau.de` เพื่อเซ็นข้อตกลง
- **ผู้ดูแล**: เดิม KIT; ปัจจุบัน TU Ilmenau
- **Version/ปี**: 2015-2016 (จากเอกสารตีพิมพ์)
- **จำนวน Participant**: ~10 subjects (จากเอกสาร — ตรวจหน้า official ไม่ได้)
- **Signal**: วิดีโอใบหน้าหลายเงื่อนไข (static/motion/talking/dark) + PPG อ้างอิง
- **Ground Truth**: pulse oximeter
- **Sampling Rate**: 30 fps (จากเอกสาร — ยืนยันอีกครั้งเมื่อได้สิทธิ์)
- **License**: ต้องเซ็น dataset agreement — **ไม่สามารถยืนยันข้อความ license จากหน้า official ได้**
- **Access Requirement**: signed agreement
- **Commercial/Competition Use**: ไม่ชัดเจน → **NOT CLEARED**
- **Ethics Requirement**: ไม่ปรากฏ
- **ข้อจำกัด**: subject น้อย; การตรวจ license ยังไม่สมบูรณ์
- **เหมาะ Train/Validation/Test**: หลังเซ็นข้อตกลงและยืนยัน license — วิจัยภายในเท่านั้น
- **วันที่ตรวจสอบ**: 2026-10-04

### 6. WESAD — ❌ NOT CLEARED FOR USE (license ambiguous)
- **Official URL**: https://archive.ics.uci.edu/dataset/465 (DOI 10.24432/C57K5T)
- **ผู้ดูแล**: UCI ML Repository (ต้นทาง: University of Siegen — Schmidt et al., ICMI 2018)
- **Version/ปี**: published 2018-09-13
- **จำนวน Participant**: 15 subjects (lab study)
- **Signal**: **chest RespiBAN: ECG, EDA, EMG, respiration, temp, accel @ 700 Hz** + wrist E4
- **Ground Truth**: labeled states (neutral/stress/amusement) + questionnaires; respiration จาก chest band
- **Sampling Rate**: 700 Hz (chest), 4-64 Hz (wrist)
- **Device/Environment**: wearable devices ในห้องแล็บ
- **License**: หน้า UCI ระบุ **"See linked dataset for licensing information"** — **ไม่พบข้อความ license ชัดเจนในการตรวจครั้งนี้**
- **Access Requirement**: เปิดดาวน์โหลดผ่าน UCI/หน้าต้นทาง
- **Commercial/Competition Use**: **ไม่ชัดเจน → NOT CLEARED** (ต้องตรวจหน้าต้นทาง eti.uni-siegen.de ก่อน)
- **Ethics Requirement**: ไม่แสดงบนหน้า UCI
- **ข้อจำกัด**: 15 คน, เป้าหมายเดิมคือ stress detection (ไม่ใช่ rPPG/RR benchmark)
- **เหมาะ Train/Validation/Test**: ใช้ respiration จาก chest band เป็น reference สำรองได้ **หลังยืนยัน license จากต้นทาง**
- **วันที่ตรวจสอบ**: 2026-10-04

### 7. CapnoBase — ❌ NOT CLEARED FOR USE
- **Official URL**: https://www.capnobase.org/
- **ผู้ดูแล**: CapnoBase (โรงพยาบาลเด็ก BC Children's / UBC)
- **Version/ปี**: ไม่ทราบ — **เว็บตรวจไม่ได้ (connect timeout 2 ครั้ง, 2026-10-04)**
- **จำนวน Participant**: ตามเอกสารที่เผยแพร่ ~42 adults + 42 neonates (ยังไม่ยืนยันจากหน้า official)
- **Signal**: PPG + capnography (CO2) + ECG (จากเอกสารที่เผยแพร่)
- **Ground Truth**: RR จาก capnometry, HR จาก ECG (ยังไม่ยืนยันจากหน้า official)
- **License**: **ไม่สามารถยืนยันได้ → NOT CLEARED FOR USE**
- **Access Requirement**: ประวัติระบุว่าต้องลงทะเบียน — ยังไม่ยืนยัน
- **วันที่ตรวจสอบ**: 2026-10-04 (ล้มเหลว)

### 8. UBFC-rPPG — ❌ NOT CLEARED FOR USE
- **Official URL**: https://sites.google.com/site/ybenezeth/ubfc-rppg
- **ผู้ดูแล**: Université de Bourgogne (Yannick Benezeth et al.)
- **Version/ปี**: 2017 (จากเอกสารที่เผยแพร่)
- **จำนวน Participant**: 49 recordings (ยังไม่ยืนยันจากหน้า official)
- **Signal**: วิดีโอใบหน้า webcam + contact PPG อ้างอิง (จากเอกสารที่เผยแพร่)
- **Ground Truth**: contact PPG → HR (ไม่มี RR reference)
- **License**: **ตรวจไม่ได้** — หน้า official เด้งไป Google login (login-wall) → **NOT CLEARED FOR USE**
- **Access Requirement**: ไม่ทราบ
- **วันที่ตรวจสอบ**: 2026-10-04

---

## ข้อควรระวังของการตรวจครั้งนี้

- ข้อมูลที่ตรวจมาสะท้อน**หน้าเว็บ ณ วันที่ 2026-10-04** — license/access อาจเปลี่ยน ต้องตรวจซ้ำก่อนดาวน์โหลดจริงทุกครั้ง
- ห้ามดาวน์โหลด dataset เข้า Git (ตามข้อห้าม) — จัดเก็บนอก repo ตาม DATASET-GOVERNANCE-AND-LICENSE-GATE.md
- สถานะ NOT CLEARED ไม่ได้แปลว่า dataset ไม่ดี — แปลว่า "ยังตรวจ/ขอสิทธิ์ไม่เสร็จ"
