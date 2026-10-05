# KNOWN-LIMITATIONS-FOR-JUDGES.md — ข้อจำกัดที่กรรมการควรทราบ (รายงานตรงไปตรงมา)

## 1. ผล Validation ที่เป็น "ผลลบ" (ไม่ได้ซ่อน)

- **Signal-only track**: BIDMC ไม่มีวิดีโอ จึงตรวจได้เฉพาะส่วนประมวลผลสัญญาณ — **ไม่ใช่ camera accuracy** และไม่ใช่ end-to-end validation
- **Systematic overcounting +8.92 breaths/min** บนสัญญาณ impedance (cardiogenic artifact) — MAE 9.03, Acceptable Error ±2 เพียง 20.7%
- **Abstention สูง 42.4%** บนสัญญาณ impedance — gate ปฏิเสธมาก เพราะ gate ออกแบบกับสัญญาณไหล่
- สองข้อนี้**ไม่ใช่ความสามารถของระบบกล้องกับผู้ใช้จริง** — เป็นข้อค้นพบของส่วน algorithm บน waveform ของผู้ป่วย ICU

## 2. สิ่งที่ยังไม่ได้พิสูจน์

- Camera accuracy ครบวงจร (ต้องมี dataset วิดีโอที่มี reference — อยู่ระหว่างหา: Mendeley Children CC BY / COHFACE ต้อง EULA)
- Clinical accuracy ทุกรูปแบบ (ทุกค่า `not-validated`)
- ประสิทธิภาพกับประชากรผู้ป่วยจริง / ผู้ใช้แอปทั่วไป
- Generalization ข้าม dataset และ fairness ข้ามกลุ่ม (สีผิว/เพศ/อายุ)
- Test-retest repeatability ในสภาพจริง

## 3. ข้อจำกัดเชิงเทคนิค

- **SpO2 ไม่มีข้อมูล** ใน local mode (VitalLens POS = HR เท่านั้น ตามซอร์สโค้ด) — ระบบแสดง "ไม่มีข้อมูล" ไม่สร้างค่าทดแทน
- tasks-vision (MediaPipe) version = UNKNOWN (vendored ไม่มี version string — ระบุไว้ใน MODEL-PROVENANCE.md)
- HR จาก rPPG มี Algorithm Confidence แต่ confidence ≠ clinical accuracy
- RR มาจากการเคลื่อนไหวไหล่ (proxy ทางอ้อม) — ได้รับผลกระทบจากการขยับ/พูด/ไอ (ระบบจะ abstain)
- ยังไม่ทดสอบกับอาสาสมัครจริงแม้แต่รายเดียว

## 4. ข้อจำกัดเชิงกระบวนการ

- Real Participant Data = NO — การเก็บข้อมูลยังไม่เริ่ม (รอ IRB/professional review ตาม VALIDATION-PROTOCOL.md)
- Consent audit log ยังเป็นแบบชั่วคราว (console/event — ไม่ใช่ audit store ถาวร)
- Manual upload วิดีโอยังไม่ผูกกับ research consent แยก
- Device-busy และ route-level timeout (150s เต็มเวลา) ยัง NOT RUN ใน error matrix

## 5. สิ่งที่เรา**ไม่ได้**ทำ (เพื่อความซื่อสัตย์)

- ไม่ซ่อน bias +8.92 / MAE 9.03 / Acceptable 20.7% / Abstention 42.4%
- ไม่ปรับ threshold หลังเห็นผล · ไม่ train เพิ่มเพื่อให้เลขดี · ไม่สร้าง metrics ปลอม
- ไม่รวม metrics ข้าม track/dataset · ไม่ใช้ correlation แทน accuracy
- ไม่ใช้คลิป AI-generated เป็น ground truth
