# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.




# 🚀 Project Blueprint & Strict Rules for Main AI (Cline)

คุณคือทีมพัฒนาหลักของโปรเจกต์นี้ กรุณาอ่านและปฏิบัติตามคำสั่งในไฟล์นี้อย่างเคร่งครัดทุกครั้งที่มีการเพิ่ม แก้ไข หรือทดสอบโค้ด เพื่อให้งานออกมาสมบูรณ์แบบในรอบเดียว ห้ามคิดเอาเองหรือปรับเปลี่ยนโครงสร้างนอกเหนือจากนี้เด็ดขาด

---

## 📂 1. STRICT DIRECTORY ARCHITECTURE (โครงสร้างโฟลเดอร์)
ห้ามเขียนโค้ดรวมกันเป็นไฟล์ขนาดใหญ่ (Monolithic) ให้แยกชิ้นส่วนโครงสร้างภายในโฟลเดอร์ frontend/src/ ออกเป็นระบบ Component-Based ดังนี้:
- frontend/src/components/ -> สำหรับเก็บชิ้นส่วน UI ย่อยที่นำกลับมาใช้ซ้ำได้ (เช่น `RiskCard.jsx`, `Button.jsx`, `Sidebar.jsx`, `Navbar.jsx`)
- frontend/src/pages/ -> สำหรับเก็บหน้าหลักแยกขาดจากกัน (เช่น `Login.jsx`, `Dashboard.jsx`, `Settings.jsx`, `Profile.jsx`)
- frontend/src/assets/ -> สำหรับเก็บไฟล์มีเดีย รูปภาพ และไอคอน

---

## 🎨 2. EXACT COLOR PALETTE & DESIGN SYSTEM (ระบบโค้ดสีดีไซน์)
ห้ามใช้สีอื่นนอกเหนือจากรหัส Hex Code ที่ระบุไว้ในพิมพ์เขียวนี้เด็ดขาด:

### 🌟 Theme Colors
- **Main Blue (ปุ่มกดหลัก / แถบเมนูบนบาร์):** #0E4B95
- **Light Blue (พื้นหลังกล่องประเมินฝั่งซ้าย):** #E6F0FA
- **Page Background (พื้นหลังรวมทุกหน้าจอ):** #F7F9FC
- **Text Gray (ตัวอักษรทั่วไป):** #555555

### 🚥 Risk Assessment Cards (การ์ดกลุ่มความเสี่ยง 4 ระดับ)
- **ระดับ 1 (สีแดง - เสี่ยงสูงสุด):** ขอบและข้อความ #D32F2F | พื้นหลังการ์ด #FFEBEE
- **ระดับ 2 (สีส้ม - เสี่ยงสูง):** ขอบและข้อความ #E65100 | พื้นหลังการ์ด #FFF3E0
- **ระดับ 3 (สีเหลือง - เสี่ยงปานกลาง):** ขอบและข้อความ #FBC02D | พื้นหลังการ์ด #FFFDE7
- **ระดับ 4 (สีเขียว - ทั่วไป):** ขอบและข้อความ #388E3C | พื้นหลังการ์ด #E8F5E9

---

## ⚙️ 3. ROUTING & STATE MANAGEMENT (ระบบเปลี่ยนหน้า)
- ใช้ react-router-dom ในการทำระบบสลับหน้าเว็บ (Routing) เสมอ
- ในช่วงแรกนี้ ให้เขียนระบบจำลองสถานะการเข้าสู่ระบบ (Mock Auth State) ไว้ก่อน โดยเมื่อผู้ใช้กดปุ่ม "เข้าสู่ระบบ" หรือ "เข้าสู่ระบบด้วย Google" บนหน้า Login.jsx ระบบต้องพาวาร์ปสลับหน้าไปยัง Dashboard.jsx ได้ทันทีอย่างลื่นไหล

---

## 🚨 4. MANDATORY CODE REVIEW PROTOCOL (กฎเหล็กระบบตรวจทาน)
ก่อนที่คุณจะสรุปผลว่าทำงานชิ้นนั้นๆ สำเร็จแล้ว (Task Completed) **คุณต้องทำตามขั้นตอนนี้ทุกครั้ง ห้ามข้ามเด็ดขาด**:
1. **ส่งรายงานให้ Reviewer Agent**: สรุปโครงสร้างโค้ดและรหัสสีที่คุณเพิ่งเขียนหรือแก้ไข นำไปรายงานให้แก่ "Senior Frontend Code Reviewer Agent" (ซึ่งศึกษาบทบาทได้จากไฟล์ REVIEWER_AGENT.md นอกสุด)
2. **ห้ามปิดงานจนกว่าจะได้รับการอนุมัติ**: 
   - หาก Reviewer Agent แจ้งจุดผิดพลาดหรือสีไม่ตรงดีไซน์ ให้คุณแก้ไขโค้ดในโปรเจกต์ทันทีแล้วส่งให้ตรวจซ้ำ
   - คุณจะสามารถจบงานนั้นได้ก็ต่อเมื่อ Reviewer Agent ตอบกลับมาด้วยคำว่า **"CODE APPROVED ✅"** เท่านั้น

   ออกแบบหน้า Landing Page / Login ในสไตล์ Modern Premium Glassmorphism Dashboard สำหรับเว็บไซต์ด้านสุขภาพหรือเทคโนโลยี โดยใช้ Layout แบบ Full Screen แบ่งหน้าจอเป็น 2 ฝั่ง (ซ้ายสำหรับแนะนำระบบ ขวาสำหรับเข้าสู่ระบบ) พื้นหลังเป็นภาพเมืองหรือธรรมชาติในช่วงพระอาทิตย์ขึ้น/ตก โทนสีน้ำเงิน-ฟ้า พร้อม Overlay และ Blur เพื่อให้ดูหรูและอ่านง่าย ใช้ธีมสีหลักเป็นน้ำเงิน (Primary), กรมท่า (Secondary), ขาว และสีเขียว เหลือง ส้ม แดง สำหรับสถานะต่าง ๆ ทุกองค์ประกอบใช้สไตล์ Glassmorphism มีพื้นหลังโปร่งใสแบบ Frosted Glass, Backdrop Blur, มุมโค้ง 20–24px, Soft Shadow และเส้นขอบสีขาวโปร่งใส ฝั่งซ้ายประกอบด้วยโลโก้ ชื่อระบบ ข้อความอธิบาย และการ์ดแสดงระดับความเสี่ยง 4 ระดับพร้อมไอคอนสีแตกต่างกัน ส่วนฝั่งขวาเป็นกล่อง Login แบบ Glass Card มีหัวข้อ ช่องกรอก Username และ Password พร้อมไอคอน ปุ่มแสดง/ซ่อนรหัสผ่าน ลิงก์ลืมรหัสผ่าน ปุ่มเข้าสู่ระบบแบบ Gradient สีน้ำเงิน ปุ่มเข้าสู่ระบบด้วย Google และลิงก์สมัครสมาชิก ใช้ฟอนต์ Prompt หรือ Noto Sans Thai เน้นตัวอักษรคมชัด อ่านง่าย มีการจัดวางแบบ Minimal ใช้พื้นที่ว่างอย่างสมดุล พร้อมเอฟเฟกต์ Hover, Transition และ Animation ที่นุ่มนวล ให้ภาพรวมดูสะอาด ทันสมัย พรีเมียม เป็นมิตรต่อผู้ใช้ และให้ความรู้สึกคล้าย Apple Human Interface, Microsoft Fluent Design และ Dashboard ระดับมืออาชีพ โดยคงความเรียบหรู โปร่ง โล่ง และใช้งานง่ายเป็นหลัก.