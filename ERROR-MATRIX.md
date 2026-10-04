# ERROR-MATRIX.md — ตาราง Error 16 กรณีของระบบประเมินความเสี่ยงทางเดินหายใจ

> อัปเดต 2026-10-04 (Phase 6) · ทุกกรณีอ้างอิงการทดสอบจริงที่ระบุในคอลัมน์ Test
> ระดับสถานะ: PASS = ทดสอบจริงแล้วผ่าน · NOT RUN = ยังไม่ทดสอบจริง (ให้เหตุผล)

## กลุ่ม A — Consent / สิทธิ์ / อุปกรณ์ (ฝั่งเบราว์เซอร์)

| # | กรณี | Expected State | Error Code/สัญญาณ | Retryable | Retry Guidance | Camera Cleanup | Temp Cleanup | Test |
|---|---|---|---|---|---|---|---|---|
| A1 | ไม่ยอม Consent | ปุ่มวัด disabled + อัปโหลด locked; `start()` ปฏิเสธ — กล้องไม่ถูกเรียก | UI guard + `CONSENT_REQUIRED` (inline error) | ได้ (ติ๊กยินยอม) | แสดงข้อความใน consent note | กล้องไม่ถูกเปิดเลย | ไม่มีไฟล์เกิด | E2E (2 เช็ค) **PASS** |
| A2 | Permission Denied | แจ้ง "เปิดกล้องไม่ได้…" + ยังประเมินจากแบบประเมินได้ ไม่ crash | `NotAllowedError` → ข้อความไทย | ได้ (ให้สิทธิ์แล้วกดใหม่) | ข้อความใน error | getUserMedia reject → ไม่มี stream ค้าง | ไม่มีไฟล์เกิด | E2E lifecycle **PASS** |
| A3 | Browser ไม่รองรับ MediaPipe/WebGL | โหลดโมเดลล้ม → RR missing + แจ้ง; **ยังบันทึกคลิปให้ vitallens ต่อได้**; ไม่ crash | landmarker = null → RR `unavailable` | ได้ (เปลี่ยนเบราว์เซอร์) | แจ้งว่า RR ขาด + ใช้สัญญาณอื่น | stream/recorder ยังทำงาน + cleanup ตามปกติ | ปกติ (route finally) | โค้ด path + E2E หลัก (โหลด GPU→CPU fallback) **PASS** (headless ทดสอบ path นี้จริงผ่าน CPU fallback) |
| A4 | ไม่พบกล้อง (NotFoundError) | เหมือน A2 | `NotFoundError` → ข้อความเดียวกับ A2 | ได้ (ต่อกล้อง) | ข้อความใน error | ไม่มี stream | ไม่มีไฟล์เกิด | E2E probe (getUserMedia ยิงจริงบนเครื่องไม่มีกล้อง = NotFoundError) **PASS** (mock: patch getUserMedia throw) |
| A5 | กล้องถูก App อื่นใช้ | เหมือน A2 (NotReadableError เข้า catch เดียวกัน) | `NotReadableError` → ข้อความเดียวกับ A2 | ได้ (ปิด app อื่น) | ข้อความใน error | ไม่มี stream | ไม่มีไฟล์เกิด | **NOT RUN** (จำลอง device busy บน Windows headless ไม่ได้จริง — catch path เดียวกับ A2 ที่ PASS) |
| A6 | ยกเลิกกลางทาง (ปุ่ม/ถอน consent) | ทุก track ended, คลิปค้างถูกทิ้ง ไม่ส่ง backend, แจ้งผู้ใช้ | `CANCELLED` (ข้อความ "ยกเลิกการวัดแล้ว…") | ได้ (retry ไม่ซ้อน stream) | กดวัดใหม่ได้เลย | ทุก track ended (ยืนยันใน E2E) | คลิปไม่ถูกส่ง → ไม่มีไฟล์ | E2E lifecycle (cancel/revoke/retry/leave) **PASS** |

## กลุ่ม B — คุณภาพภาพ/สัญญาณ (Quality Gate — Phase 2)

| # | กรณี | Expected State | Error Code | Retryable | Retry Guidance | Camera Cleanup | Temp Cleanup | Test |
|---|---|---|---|---|---|---|---|---|
| B1 | แสงน้อย | qualityStatus insufficient, canUseMeasurement=false, RR ไม่เข้า scoring | `brightness:fail` + missingReason + retryGuidance | ได้ | "เพิ่มแสงในห้อง — ต้องการแสงสว่างเพียงพอ" | วัดครบแล้วปกติ | คลิปยังส่ง vitallens ได้ (ปกติ) | Unit (สังเคราะห์ภาพมืด) **PASS** |
| B2 | ภาพเบลอ | เหมือน B1 | `blur:fail` | ได้ | "ทำความสะอาดเลนส์ จัดระยะใหม่" | ปกติ | ปกติ | Unit **PASS** |
| B3 | อยู่นอกเฟรม (ไหล่หาย) | <50% = fail; 50-70% = warn (ใช้ได้+เตือน) | `poseVisibility:fail/warn` | ได้ | "จัดเฟรมให้เห็นไหล่ทั้งสอง" | ปกติ | ปกติ | Unit **PASS** |
| B4 | ขยับมาก/พูด/ไอ | fail → ค่าไม่ถูกใช้ | `motion:fail` | ได้ | "นั่งนิ่ง หยุดพูด หายใจปกติ" | ปกติ | ปกติ | Unit **PASS** + E2E (fake camera โดนจริง) **PASS** |
| B5 | FPS ต่ำ / Dropped Frames | fail (<7fps / dropped>35%) | `fps:fail`, `droppedFrames:fail` | ได้ | "ปิดแอปอื่น/เปลี่ยนอุปกรณ์" | ปกติ | ปกติ | Unit **PASS** + E2E **PASS** |
| B6 | วัดสั้นกว่า 90% | fail duration | `duration:fail` | ได้ | "วัดใหม่ครบ 30 วินาที" | ปกติ | ปกติ | Unit **PASS** |
| B7 | Periodicity/CV ไม่ผ่าน | bpm ถูก gate เป็น null + quality fail → Missing/Unusable | `periodicity:fail`, `intervalCv:fail` | ได้ | "นั่งพัก หายใจสม่ำเสมอ วัดใหม่" | ปกติ | ปกติ | Unit **PASS** + E2E **PASS** |

## กลุ่ม C — Backend / ไฟล์ / เครือข่าย

| # | กรณี | Expected State | Error Code | Retryable | Retry Guidance | Camera Cleanup | Temp Cleanup | Test |
|---|---|---|---|---|---|---|---|---|
| C1 | MIME ไม่ถูกต้อง | **415** ไม่ประมวลผล | `unsupported video content` | ได้ (ส่ง webm/mp4 จริง) | ข้อความ UI แจ้งวิธี | ไม่เกี่ยว | ไม่มี temp เกิด | Security test **PASS** |
| C2 | ไฟล์ใหญ่เกิน 60MB | **413** ก่อน parse body | `video too large` | ได้ (คลิปสั้นลง) | แจ้งขีดจำกัด | ไม่เกี่ยว | ไม่มี temp เกิด | Security test **PASS** |
| C3 | วิดีโอยาวเกิน 90s | ok:false ก่อน vitallens | `video too long (…, max 90s)` | ได้ | แจ้งใช้คลิปสั้น | ไม่เกี่ยว | ลบใน finally | Security test **PASS** |
| C4 | Decode ล้มเหลว / ไฟล์เสีย | ok:false "broken or undecodable video", error ไม่มี path | `broken or undecodable video` | ได้ | แจ้งผู้ใช้ใช้ fallback | ไม่เกี่ยว | ลบใน finally | Security test **PASS** |
| C5 | Network/Backend ล้ม (abort/500) | soft failure + แจ้ง "ใช้ MediaPipe RR + แบบประเมินแทน" ไม่ crash | `vital-signs API ตอบ …` / `เรียก … ไม่สำเร็จ` | ได้ | แจ้งลองใหม่ | ไม่เกี่ยว | ไม่มี temp (parse fail ก่อน) | E2E (route.abort) **PASS** |
| C6 | **Runner Timeout** | child python ถูก kill **ทั้ง tree** (taskkill /T บน Windows — ไม่ทิ้ง ffmpeg orphan), error แจ้ง timeout, **temp ลบใน finally** | `vitallens timed out after …ms (process tree killed)` | ได้ | แจ้งลองใหม่ | ไม่เกี่ยว | route finally (ตรวจใน C1-C4); lib-level tree-kill + orphan-file unlock ยืนยันแล้ว | Timeout test จริง (env-config, kill ~3s, orphan ถูกเก็บ) **PASS** · route-level 150s **NOT RUN** (ต้องรอ 150s จริง — kill logic เดียวกับที่ PASS, production timeout ไม่ถูกลด) |

## สรุป

- **PASS 15 กรณี** · **NOT RUN 2 รายการย่อย**: A5 (device busy จำลองไม่ได้จริง — ใช้ catch path เดียวกับ A2) และ C6 route-level 150s (kill logic ยืนยันแล้วที่ lib-level)
- ทุกกรณี failure → ผู้ใช้เห็นเหตุผล + แนวทาง retry · ทุกกรณี → ไม่มีค่าปลอมเข้า scoring (RR missing, SpO2 missing เสมอ)
- หลักการเหมือนกันทุกกรณี: **คุณภาพไม่พอ = ไม่ออกค่า** ไม่ใช่ "ค่าต่ำ/ปกติ"
