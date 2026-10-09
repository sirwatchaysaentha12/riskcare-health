# Respiratory Risk Specification (Reference Only)

> สถานะ: ข้อกำหนดอ้างอิงที่ผู้ใช้ให้มา ไม่ใช่ feature ที่ implement แล้ว ไม่ผ่านการรับรองทางการแพทย์ และยังไม่มี validation รองรับ risk score/diagnosis ห้ามนำข้อมูลจริงของผู้ป่วยมาเก็บหรือใช้กับระบบนี้จนกว่าจะผ่านการทบทวนด้านการแพทย์ ความเป็นส่วนตัว ความปลอดภัย และข้อกำกับที่เกี่ยวข้อง

## A. Data Schema ที่ระบบต้องมี
patient: patient_id, age, sex, height_cm, weight_kg, bmi, smoking_status, known_diseases, medications
session: session_id, patient_id, start_time, duration_sec (30-60s), camera_type, frame_rate_fps (>=20-30), resolution, protocol (sitting_upright_quiet_breathing), environment {lighting, clothing, obstructions}
resp_signals[]: roi_name (chest/neck/abdomen), time_series[], sampling_rate_hz, preprocessing (bandpass 0.1-1.0Hz, detrend)
features: rr_mean_bpm, rr_std_bpm, rr_min_bpm, rr_max_bpm, inspiratory_time_mean_sec, expiratory_time_mean_sec, duty_cycle, chest_amplitude_mean, abdomen_amplitude_mean, chest_abdomen_phase_diff_deg, respiratory_rate_variability_index, alternans_index, asynchronous_abdomen_index, accessory_muscle_activity_index, apnea_events_count, hypopnea_events_count, signal_quality_score
clinical_labels: reference_rr_bpm, reference_rr_source, diagnosis, severity_grade, need_hospital_admission, need_icu, comment_by_physician

## B. Pipeline ที่ต้องมี
1 capture webcam (getUserMedia 1280x720 @30fps)
2 ROI: chest / neck / abdomen (manual box ก่อน แล้วค่อย pose estimation)
3 motion signal: mean pixel intensity ต่อ ROI ต่อเฟรม หรือ optical flow
4 filter: bandpass 0.1-1.0 Hz (Butterworth order 4) + detrend
5 RR = (จำนวน peak / duration_sec) x 60 ; หรือ breath-by-breath 60/T_R
6 amplitude = peak-to-trough ต่อ breath ; duty_cycle = T_insp / (T_insp + T_exp)
7 kinematic indices 4 กลุ่ม (labored breathing signature):
   - irregular rhythm / RR variability (CV ของช่วง breath)
   - accessory muscle recruitment (amplitude คอ/ไหล่ เทียบทรวงอก)
   - asynchronous abdominal motion (phase diff chest vs abdomen ใกล้ 180 องศา)
   - respiratory alternans (สลับ dominance chest/abdomen)
8 apnea/hypopnea: ช่วงที่ amplitude ต่ำผิดปกติหรือไม่มีการเคลื่อนไหว
9 risk model: logistic P = sigmoid(b0 + sum bk*xk) -> risk_score = P*100
10 risk_level: 0-30 low, 31-60 medium, 61-100 high (threshold ปรับได้)
11 API: POST /api/respiratory-risk -> {risk_score, risk_level, key_drivers[]}
12 logging: model version, features, risk_score, physician override

## C. ข้อกำหนดทางการแพทย์
- เป็น screening tool ไม่ใช่ diagnosis ต้องมี disclaimer ใน UI
- ต้องมีช่องให้แพทย์ override และบันทึกความเห็น
- ต้องมี reference RR จากอุปกรณ์มาตรฐานสำหรับ validation
- เข้ารหัสวิดีโอ/ข้อมูลสุขภาพ จำกัดสิทธิ์เข้าถึง
- signal_quality_score ต้องบล็อกผลที่คุณภาพต่ำ
