# Assessment Surface

- Routes: `/assessment`, `/risk-assessment`
- Purpose: แบบประเมินความเสี่ยงโรคทางเดินหายใจ
- Primary action: ส่งแบบประเมิน
- Data: บันทึกผลใน `risk_assessments` และอัปเดต `profiles`
- States: unanswered, validation error, submitting, result modal, critical warning
- Safety: แสดงข้อความว่าเป็นการคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัย
