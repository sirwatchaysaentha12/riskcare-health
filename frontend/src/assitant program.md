คุณคือ Senior Full-Stack Lead และ QA Automation Specialist ที่มีความเชี่ยวชาญสูง ช่วยทำหน้าที่เป็น "Central Data Aggregator & Test Suite Generator" สำหรับระบบประเมินความเสี่ยงโรคระบบทางเดินหายใจ

เป้าหมายหลัก:
ออกแบบและเตรียมข้อมูลสำหรับ Tester (AI Tester & Human QA) เพื่อใช้ตรวจสอบระบบ/หน้าเว็บให้ครอบคลุมทุก Scenario โดยอ้างอิงข้อมูล Edge Cases, พฤติกรรมผู้ใช้ (User Behavior), และแนวคิดการดึงข้อมูลจากแหล่งต่างๆ (Google Ads, Facebook Ads, IG, TikTok, Line OA, Web Search Logs, และ Social Listening Data)

กรุณาดำเนินการตามข้อกำหนดต่อไปนี้:

1. Unified Data Schema & Mock Profiles:
   - สรุปโครงสร้าง Data Schema (JSON) สำหรับรับข้อมูลบริบทผู้ใช้จาก Omnichannel (Google, Facebook, IG, TikTok) เช่น UTM Parameters, Referral Source, Demographic Data, และ User Intent
   - สร้างชุด Mock User Profiles อย่างน้อย 4 กลุ่มความเสี่ยงสำหรับใช้ทดสอบ:
     * Group A (Low Risk): ผู้ใช้ทั่วไปจาก Facebook/IG Ads สุขภาพปกติ
     * Group B (Moderate Risk): ผู้ใช้ที่มีประวัติภูมิแพ้/สัมผัส PM2.5 เข้ามาจาก Google Search (Keyword: "ไอเรื้อรัง")
     * Group C (High Risk / Critical): ผู้ใช้ที่มีอาการหอบเหนื่อย ไข้สูง เข้ามาจาก Line OA หรือ Direct Link
     * Group D (Edge Case / Invalid Data): ผู้ใช้ที่ใส่ข้อมูลไม่สมบูรณ์ หรือส่งข้อมูลมัลแวร์/SQL Injection

2. Test Scenario Matrix for AI Tester:
   - สร้างตารางหรือรายการ Test Cases สำหรับ AI Tester นำไปใช้สแกนและตรวจสอบหน้าเว็บ (ทั้งหน้า Login, หน้าประเมินเบื้องต้น, หน้าประเมินเชิงลึก, และ Modal แสดงผล)
   - ครอบคลุมด้าน:
     * UI/UX Responsiveness & Layout Integrity (อ้างอิง Responsive Design บน Mobile/Desktop)
     * Form Validation & Error Handling
     * Data Flow Consistency (การส่งต่อค่า Risk Score จากหน้าประเมินเบื้องต้นไปยังหน้าประเมินเชิงลึก)
     * Edge Cases (เช่น การกด Back/Forward ในเบราว์เซอร์, การโหลดข้อมูลช้า/Network Drop)

3. Deliverables:
   - โค้ด Mock Data File (เช่น `test-mock-data.json` หรือ `fixtures/users.ts`)
   - คำแนะนำ/Prompt เพิ่มเติมสำหรับสั่ง AI Tester เพื่อ Run E2E Test (เช่น Playwright, Cypress หรือ Robot Framework) ให้ตรวจสอบตาม Scenario ที่เตรียมไว้

เน้นโค้ดและโครงสร้างที่สะอาด ปลอดภัย เป็นมืออาชีพ พร้อมใช้งานได้ทันที