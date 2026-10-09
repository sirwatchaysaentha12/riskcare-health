# Respiratory Camera Prototype — Research and Provenance Status

เอกสารนี้บันทึกสิ่งที่ตรวจสอบได้จาก implementation ปัจจุบัน เพื่อแยกต้นแบบสาธิตออกจากหลักฐานการประเมินจริง ระบบนี้ไม่วินิจฉัยโรคและไม่มี disease-risk score

## Implementation ที่ตรวจพบ

- หน้าใช้งาน: `frontend/src/pages/BreathingRateCheck.jsx`
- ตรวจภาพเบื้องต้น: `frontend/src/utils/cameraQuality.js`
- ประมาณสัญญาณการเคลื่อนไหว: `frontend/src/utils/breathingRate.js`
- Route: `/breathing-check`; ปุ่มทางเข้าอยู่ใน shared navigation
- Browser ขอสิทธิ์กล้องหลังผู้ใช้ยินยอมเท่านั้น และขอ video โดยปิด audio
- ภาพจากกล้องถูกวิเคราะห์ผ่าน video/canvas ในหน้าเว็บตามโค้ดที่ตรวจ ไม่พบการอัปโหลดภาพไป API หรือการบันทึกไฟล์ภาพใน flow นี้
- มีการดาวน์โหลดไลบรารีและไฟล์โมเดลจาก CDN/Google ซึ่งเป็นการเชื่อมต่อภายนอกเพื่อโหลดซอฟต์แวร์/โมเดล ไม่ใช่การส่งภาพกล้องออกไป

## Model and data provenance

| รายการ | สิ่งที่ยืนยันได้ | สิ่งที่ยังไม่ยืนยัน |
| --- | --- | --- |
| Runtime library | MediaPipe Tasks Vision URL ระบุ version `0.10.14` | การตรวจสอบ license/เงื่อนไขแจกจ่ายจากแหล่งทางการยังไม่ทำ |
| Model asset | Pose Landmarker Lite, `float16/1`, โหลดจาก Google Storage URL ใน source | model card, license, training dataset และข้อจำกัดรายกลุ่มยังไม่ได้บันทึกหรือยืนยัน |
| Model purpose | ใช้ตรวจ pose landmarks เพื่อช่วยวางกรอบและดึงตำแหน่งไหล่ | ไม่ใช่โมเดลตรวจโรค และไม่มีหลักฐานให้ตีความ landmarks เป็นผลวินิจฉัย |
| Evaluation data | มี unit tests สำหรับ heuristic และ signal processing | ไม่มีชุดข้อมูลผู้เข้าร่วมพร้อม consent/reference measurement หรือ external validation ใน repository |

## Test evidence (ไม่ใช่ clinical validation)

- `frontend/tests/cameraQuality.test.mjs`: ทดสอบ fixture ภาพที่สร้างใน test สำหรับแสง รายละเอียดเฟรม การเปลี่ยนแปลงเฟรม ตำแหน่งลำตัว ท่าหันข้าง และ video readiness
- `frontend/tests/breathingRate.test.mjs`: ทดสอบสัญญาณตัวอย่างที่สร้างใน test สำหรับพฤติกรรมคำนวณ
- ผล test เหล่านี้ตรวจ business logic เท่านั้น ไม่ใช่ผลจากผู้ใช้จริง ไม่ใช้คำนวณ Sensitivity, Specificity, MAE, RMSE, Bias หรือ Accuracy และห้ามนำไปอ้างเป็นสมรรถนะทางการแพทย์

## ข้อมูลที่ต้องมีก่อนประเมินจริง

1. ระบุ model card, license, dataset/provenance และเงื่อนไขการใช้งานของ library/model จากแหล่งต้นทาง
2. จัดทำ protocol และ consent ที่เหมาะสม พร้อม reference respiratory-rate measurement ที่ซิงโครไนซ์กับวิดีโอ
3. กำหนด development/test split ล่วงหน้า และเก็บเฉพาะข้อมูลที่ได้รับอนุญาต โดยลดการเก็บภาพ/ข้อมูลระบุตัวบุคคล
4. ประเมิน MAE/RMSE/Bias และ Bland–Altman สำหรับอัตราการหายใจ รวมทั้งอัตรา `insufficient_data`/ความล้มเหลว แยกตามแสง ระยะ เสื้อผ้า ท่าทาง และอุปกรณ์
5. ทำ external validation และทบทวนความเป็นธรรม/ความปลอดภัยก่อนสื่อสารผลนอกบริบท Prototype/Research Demo

จนกว่าจะทำขั้นตอนเหล่านี้ ระบบควรแสดงผลเป็นค่าประมาณจากการเคลื่อนไหวของภาพพร้อมข้อจำกัดเท่านั้น ไม่แสดงคะแนนความเสี่ยงโรค ไม่กล่าวว่าเป็น/ไม่เป็นโรค และไม่แนะนำยา
