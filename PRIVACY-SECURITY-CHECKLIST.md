# PRIVACY-SECURITY-CHECKLIST.md — ตรวจสอบก่อนเก็บข้อมูลจริง

> อัปเดต 2026-10-04 (Phase 5) · ตรวจจากโค้ดจริง (`route.ts`, `vital_signs_runner.py`, `RrCameraCapture.jsx`, `CameraConsent.jsx`)

## Consent

- [x] Consent screen แสดงก่อนปุ่มเริ่มวัด — แจ้ง: จุดประสงค์กล้อง / 30 วินาที / ประมวลผลที่ไหน / ส่ง backend localhost / raw video ไม่เก็บ / ไม่ใช่การวินิจฉัย / ยกเลิกได้
- [x] แยก checkbox: ยินยอมกล้อง / รับทราบข้อจำกัด / (สมัครใจ) วิจัย
- [x] Research consent **ไม่**ถูกเลือกไว้ล่วงหน้า
- [x] ไม่ยอมรับ → ปุ่มเริ่มวัด disabled; `start()` ตรวจ `enabled` อีกชั้น (ห้าม getUserMedia/MediaRecorder)
- [x] ถอน consent ระหว่างวัด → stopEverything + ทิ้งคลิปค้าง ไม่ส่ง backend
- [ ] Consent screen ฉบับ IRB (รอผ่านจริยธรรม — Phase 4 consent plan)

## Backend Upload Validation

- [x] MIME จากเนื้อไฟล์จริง (magic bytes: webm EBML `1A45DFA3`, mp4 `ftyp`) — ไม่เชื่อ Content-Type/ชื่อไฟล์ client
- [x] Extension allowlist: ชื่อไฟล์ temp = `upload.webm` / `upload.mp4` จากผล detection เท่านั้น (ชื่อไฟล์ client ถูกเมิน)
- [x] Size limit 60 MB (413 เมื่อเกิน)
- [x] Duration limit 90 วินาที (ffprobe ใน runner → ปฏิเสธก่อนประมวลผล)
- [x] Decode validation: ffmpeg VFR→CFR ล้มเหลว = "broken or undecodable video" (ไม่ป้อนของเสียให้ vitallens)
- [x] Timeout: runner 150s (route), ffmpeg 180s, ffprobe 30s

## Temp File / Path / Shell

- [x] ชื่อไฟล์ชั่วคราว server สร้างเองใน mkdtemp dir สุ่มต่อคำขอ — client filename ไม่ถูกใช้ → path traversal ปิด
- [x] Shell injection: ไม่มี shell string — spawn ด้วย argument array ทั้ง Node (`spawn(python, [runner, path])`) และ python (`subprocess.run([...], shell=False default)`)
- [x] ลบ temp ใน `finally` ครอบ success / failure / timeout / abort

## Error & Logging

- [x] Error response ผ่าน `redactError()` — ตัด Windows/Unix path ออก (ไม่เผย stack trace, local path, key, env)
- [x] ไม่มีการ log raw video / blob / base64 / ภาพ / ค่าสุขภาพ / email / ชื่อ (route ไม่ log, runner print JSON เฉพาะผล)
- [x] ไม่มี API key ในโค้ด (โหมด local ไม่ใช้ key)

## Git

- [x] ไม่มี mapping ตัวตนจริง ↔ Pseudonymous ID ใน Git (ระบบยังไม่มีตารางเชื่อม — อยู่นอก repo ตาม Consent Plan)
- [x] tmp-vitallens/ (คลิปทดสอบ) gitignored · ffmpeg binary gitignored
- [ ] ตรวจซ้ำก่อน merge ทุกครั้ง (งานต่อเนื่อง)

## การทดสอบ

- [x] Browser lifecycle tests (E2E Phase 5: consent gate / deny / ยกเลิก / ออกหน้า / retry / backend error / track หยุดครบ)
- [x] Security tests (HTTP จริง: MIME ปลอม / extension แปลก+path traversal+shell injection ในชื่อไฟล์ / ไฟล์ใหญ่เกิน / ยาวเกิน / ไฟล์เสีย / temp cleanup / error redaction / duplicate request)
- [x] ใช้ mock camera/synthetic clip เท่านั้น — ไม่มีข้อมูลอาสาสมัครจริง

## สถานะรวม

**พร้อมเชิงเทคนิค** — แต่ "ยังไม่ควรเริ่มเก็บข้อมูลอาสาสมัครจริง — REQUIRES PROFESSIONAL REVIEW"
(ต้องผ่านผู้ตรวจด้านจริยธรรม/IRB และ consent ฉบับสมบูรณ์ก่อน — ดู PARTICIPANT-CONSENT-PLAN.md checklist)
