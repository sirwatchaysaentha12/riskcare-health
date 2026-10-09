# Respiratory Risk Spec — Gap Report

ตรวจ source, schema, tests และเอกสารใน `frontend/`, `admin-app/` และ `supabase/` โดยไม่รวม dependencies/build output/log files สถานะอธิบาย implementation ปัจจุบัน ไม่ใช่การรับรองทางการแพทย์

## A. Data Schema

| รายการใน A/B/C | มีในโค้ดหรือไม่ (มี/บางส่วน/ไม่มี) | ไฟล์ที่พบ | สิ่งที่ขาด |
|---|---|---|---|
| A — patient | บางส่วน | `admin-app/supabase/health_planning.sql`, `admin-app/supabase/schema.sql` | มี account/profile และข้อมูลสุขภาพบางช่อง เช่น age/height/weight/chronic condition/medication; schema ไม่ครบ sex, BMI, smoking status, known diseases แบบกำหนดมาตรฐาน และ `patient_id` schema เฉพาะฟีเจอร์นี้ |
| A — session | บางส่วน | `frontend/src/pages/BreathingRateCheck.jsx` | มีเวลา/สถานะในหน่วยความจำและวัด 30 วินาที แต่ไม่มี session record, camera type, FPS/resolution จริง, protocol/environment ครบ |
| A — resp_signals[] | บางส่วน | `frontend/src/pages/BreathingRateCheck.jsx`, `frontend/src/utils/breathingRate.js` | เก็บตัวอย่างชั่วคราว `{t,y}` จากตำแหน่งไหล่ ไม่แยก chest/neck/abdomen ROI และไม่มี sampling-rate metadata |
| A — features | บางส่วน | `frontend/src/utils/breathingRate.js` | คำนวณ bpm/จำนวน peaks/ช่วงเวลาเท่านั้น; ขาด variability, inhale/exhale, duty cycle, amplitude และ indices อื่น |
| A — clinical_labels | ไม่มี | ไม่พบ respiratory labels/schema | ไม่มี reference RR source, diagnosis/severity/admission/ICU หรือ physician comments; ไม่ควรเพิ่มข้อมูลเหล่านี้ก่อนมี governance/validation |

## B. Pipeline

| รายการใน A/B/C | มีในโค้ดหรือไม่ (มี/บางส่วน/ไม่มี) | ไฟล์ที่พบ | สิ่งที่ขาด |
|---|---|---|---|
| B1 — capture webcam 1280×720 @30fps | บางส่วน | `frontend/src/pages/BreathingRateCheck.jsx` | ขอ 640×480; ไม่กำหนดหรือวัด FPS ที่ได้จริง |
| B2 — chest/neck/abdomen ROI | บางส่วน | `frontend/src/pages/BreathingRateCheck.jsx`, `frontend/src/utils/cameraQuality.js` | ใช้ pose landmarks บริเวณไหล่/ลำตัวช่วย quality gate; ไม่มี manual ROI และ ROI แยกสามบริเวณ |
| B3 — motion signal ต่อ ROI | บางส่วน | `frontend/src/utils/breathingRate.js` | ใช้ค่าเฉลี่ยตำแหน่ง y ของไหล่; ไม่มี pixel-intensity/optical-flow signal แยก ROI |
| B4 — Butterworth 0.1–1.0 Hz + detrend | บางส่วน | `frontend/src/utils/breathingRate.js` | มี moving average และ detrend แต่ไม่มี Butterworth bandpass |
| B5 — respiratory rate จาก peaks | บางส่วน | `frontend/src/utils/breathingRate.js` | มี peak count ต่อช่วงเวลาจริง แต่หน้าปัจจุบันวัด 30 วินาที; ไม่ได้ตรวจ breath cycle เทียบ reference |
| B6 — amplitude/duty cycle | ไม่มี | ไม่พบ | ไม่มี peak-to-trough ต่อรอบหรือ inhale/exhale timing |
| B7 — kinematic indices 4 กลุ่ม | ไม่มี | ไม่พบ | ไม่มี CV, accessory muscle, chest-abdomen phase หรือ alternans index |
| B8 — apnea/hypopnea events | ไม่มี | ไม่พบ | ไม่มี event detector และไม่มี clinical validation |
| B9 — logistic disease-risk model | ไม่มี | ไม่พบใน respiratory flow | ไม่มี feature coefficients/training/validation; ห้ามสร้างคะแนนโรคจากข้อมูลนี้ |
| B10 — risk_level ตาม threshold | ไม่มี | ไม่พบใน respiratory flow | ไม่มี respiratory risk category; risk assessment อื่นในระบบเป็นคนละ feature |
| B11 — POST `/api/respiratory-risk` | ไม่มี | ไม่พบ | ไม่มี endpoint ดังกล่าว |
| B12 — model/features/risk/physician override logging | ไม่มี | ไม่พบใน respiratory flow | ไม่มี model/clinical logging; การไม่ log ภาพ/เสียงเป็นคุณลักษณะ privacy ที่ควรรักษาไว้ |

## C. Medical/Safety Requirements

| รายการใน A/B/C | มีในโค้ดหรือไม่ (มี/บางส่วน/ไม่มี) | ไฟล์ที่พบ | สิ่งที่ขาด |
|---|---|---|---|
| C1 — screening disclaimer | บางส่วน | `frontend/src/pages/BreathingRateCheck.jsx` | มีข้อความว่าเป็น prototype/ไม่ใช่การวินิจฉัย แต่ยังต้องทบทวนข้อความที่แสดงและห้ามอ้างว่าผลยืนยันว่าปลอดโรค |
| C2 — physician override/comment | ไม่มี | ไม่พบ | ไม่มี workflow แพทย์และการบันทึกความเห็น |
| C3 — reference RR สำหรับ validation | ไม่มี | `frontend/tests/breathingRate.test.mjs` | tests ใช้สัญญาณสังเคราะห์ ไม่ใช่ reference device หรือผู้ประเมินจริง; ไม่มี clinical validation |
| C4 — encryption/access control สำหรับวิดีโอ/ข้อมูลสุขภาพ | บางส่วน | `frontend/src/pages/BreathingRateCheck.jsx`, `admin-app/supabase/health_planning.sql` | webcam flow ไม่พบการบันทึก/ส่งวิดีโอ และมี auth/RLS ในข้อมูลสุขภาพส่วนอื่น แต่ไม่มี storage/security design เฉพาะ respiratory data; ต้องทบทวนก่อนเก็บข้อมูล |
| C5 — signal_quality_score บล็อกผลคุณภาพต่ำ | บางส่วน | `frontend/src/utils/cameraQuality.js`, `frontend/src/pages/BreathingRateCheck.jsx` | มี heuristic gate สำหรับแสง/รายละเอียด/การเคลื่อนไหว/landmarks แต่ไม่มีคะแนนที่ผ่าน validation; gate นี้ไม่ใช่ clinical signal-quality score |

## วิธีคำนวณความครบถ้วน

แบ่งสเปกเป็น 22 รายการ (A=5, B=12, C=5); ให้ `มี=1`, `บางส่วน=0.5`, `ไม่มี=0` แล้วหารด้วย 22 ได้ `(12×0.5 + 10×0) / 22 = 27.3%` ปัดเป็น **ประมาณ 27% ของรายการสเปกที่มี implementation บางส่วนหรือครบ** คะแนนนี้วัดความสอดคล้องเชิง feature เท่านั้น ไม่ใช่ความแม่นยำ ความปลอดภัย หรือความพร้อมทางการแพทย์

## สิ่งที่ขาด เรียงตามความสำคัญ

1. **Reference protocol และ validation จริง** — กำหนด intended use, consent, reference RR, protocol, test split และ metrics ก่อนกล่าวอ้างผลใด ๆ
2. **ความปลอดภัย/ธรรมาภิบาลข้อมูลสุขภาพ** — ระบุเหตุผลและสิทธิ์เก็บแต่ละ field, retention, access, encryption, privacy review และการอนุมัติที่จำเป็น; หลีกเลี่ยงเก็บวิดีโอหากไม่จำเป็น
3. **Signal acquisition ที่กำหนดและตรวจได้** — sampling rate/FPS จริง, ROI ที่กำหนด, ข้อมูลหลายบริเวณและ handling เมื่อสัญญาณไม่พอ
4. **Signal processing/features ตามสเปก** — validated filter, breath-cycle timing, amplitude และ indices; ไม่ควรเพิ่ม features เชิงโรคก่อนมีหลักฐานรองรับ
5. **Clinical model/API/labels** — ไม่มีโมเดล/labels/แพทย์ override/API และยังไม่ควรสร้าง risk score หรือ diagnosis จนผ่านการทบทวนจากผู้เชี่ยวชาญและ validation ที่เหมาะสม

## ข้อสรุป

ระบบปัจจุบันเป็น prototype ประมาณการการเคลื่อนไหวแนวไหล่จาก webcam 30 วินาที พร้อมภาพตรวจคุณภาพเบื้องต้นเท่านั้น ไม่ใช่ respiratory-risk screening ที่ผ่าน validation และไม่ควรใช้ตัดสินใจทางการแพทย์
