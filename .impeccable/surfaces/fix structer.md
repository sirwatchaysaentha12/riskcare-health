# Impeccable Audit — สรุปปัญหาและวิธีแก้ไข RiskCARE

วันที่ตรวจสอบ: 16 สิงหาคม 2026

## สถานะปัจจุบัน

ผลตรวจสอบอัตโนมัติผ่านทั้งหมด:

- `npm run lint` ผ่าน
- `npm run test:provinces` ผ่าน 4/4
- `npm run build` ผ่าน
- ไม่พบข้อผิดพลาดที่ทำให้ Build ล้มเหลว
- ไม่พบระบบ Checkout/Cart/Payment ในโปรเจกต์ปัจจุบัน จึงยังไม่มี Checkout Flow ให้ Audit

## ปัญหาที่พบและระดับความสำคัญ

### 1. Design System ในเอกสารไม่ตรงกับ UI — ระดับ Medium

`PRODUCT.md` ยังระบุว่าเว็บใช้ Dark Mode แต่ UI ปัจจุบันใช้ธีมเขียว-ขาว โดยเฉพาะหน้าหลักและการ์ด PM2.5

วิธีแก้:

1. เลือก Theme หลักให้ชัดเจนว่าใช้ Green/White
2. แก้ส่วน Brand/Visual World ใน `PRODUCT.md` จาก Dark Mode เป็น Green/White
3. อัปเดตเอกสารใน `IMPECCABLE.md` ให้ตรงกับ Theme จริง
4. ใช้ไฟล์ `.impeccable/surfaces/*.md` เป็นเอกสารอ้างอิงเดียวกัน

### 2. สีถูกเขียนแบบ Hardcode หลายจุด — ระดับ Medium

พบสีแบบ Hex และ `rgba()` กระจายอยู่ใน CSS เช่น `#047857`, `#059669`, `#34d399` และสีสถานะต่าง ๆ ทำให้เปลี่ยน Theme ยาก

วิธีแก้:

1. กำหนดสีทั้งหมดไว้ใน `:root` เช่น:

```css
:root {
  --color-primary: #10B981;
  --color-primary-dark: #059669;
  --color-primary-light: #ECFDF5;
  --color-primary-soft: #D1FAE5;
  --color-text: #0F172A;
  --color-card: #FFFFFF;
  --color-border: #E2E8F0;
}
```

2. เปลี่ยน CSS เช่น `color: #047857` เป็น `color: var(--color-primary-dark)`
3. ใช้ตัวแปรเดียวกันกับปุ่ม, การ์ด, Badge, Border และ Focus State
4. เก็บสีความเสี่ยงไว้เป็นตัวแปรแยก เช่น `--risk-warning`, `--risk-danger`

### 3. Debug Console ยังแสดงใน Runtime — ระดับ Low

พบ `console.log`, `console.warn` และ `console.error` ในระบบ PM2.5, API และ Assessment ซึ่งมีประโยชน์ตอนพัฒนา แต่ไม่ควรแสดงข้อมูล Debug ใน Production

วิธีแก้:

```js
if (import.meta.env.DEV) {
  console.log('[RiskApp System Verification]', payload)
}
```

สำหรับ Error ที่ต้องติดตามจริง ให้ใช้ระบบ Error Boundary หรือ Logging Service แทนการพิมพ์ข้อมูลส่วนตัวลง Console

### 4. JavaScript Bundle มีขนาดใหญ่ — ระดับ Low

Vite แจ้ง Bundle หลัง Minify มีขนาดมากกว่า 500 kB ประมาณ 540 kB

วิธีแก้:

1. ใช้ `React.lazy()` แยกหน้า Assessment, Dashboard และ Admin
2. ใช้ `Suspense` แสดง Loading UI ระหว่างโหลดหน้า
3. ตรวจสอบ Dependency ที่ไม่จำเป็น
4. แยก Component ที่ไม่ต้องโหลดบนหน้าแรกออกเป็น Dynamic Import

ตัวอย่าง:

```jsx
const Assessment = lazy(() => import('./pages/Assessment'))

<Suspense fallback={<p>กำลังโหลด...</p>}>
  <Assessment />
</Suspense>
```

### 5. ขอบเขตข้อมูลสุขภาพ — ระดับ High สำหรับ Production

ระบบเป็น Prototype Scoring และยังไม่ใช่เครื่องมือวินิจฉัยโรค จึงต้องคงข้อความเตือนและตรวจทานโดยบุคลากรทางการแพทย์ก่อนใช้งานจริง

วิธีแก้:

1. แสดง Disclaimer ในหน้า Assessment และผลลัพธ์
2. สัญญาณฉุกเฉินต้องแสดงชัดเจนด้วยข้อความและสี ไม่ใช้สีเพียงอย่างเดียว
3. ไม่ใช้ผลคะแนนเพื่อยืนยันหรือปฏิเสธโรค
4. จำกัดการเข้าถึงข้อมูลใน Supabase ด้วย RLS
5. ห้ามบันทึกข้อมูลสุขภาพลง Console หรือ LocalStorage โดยไม่จำเป็น

## สิ่งที่ตรวจสอบแล้วว่าทำงาน

- Login รองรับ Email, Username และ Phone
- Profile รองรับการแก้ไขชื่อและจังหวัด
- Avatar รองรับ JPG/PNG และ Preview
- History อ่านข้อมูลจาก `risk_assessments`
- Master Data จังหวัดครบ 77 จังหวัด
- Master Data อำเภอถูกแยกเป็น `thailandDistricts.json`
- PM2.5 Card จับคู่จังหวัด/อำเภอและจัดอันดับ Top 5
- มี Fallback เมื่อ API ไม่มีข้อมูลหรือคืนค่า Null
- มี Automated Test สำหรับจังหวัดและ Fallback

## ขั้นตอนตรวจสอบก่อน Deploy

รันจากโฟลเดอร์ `frontend`:

```bash
npm run lint
npm run test:provinces
npm run build
```

จากนั้นตรวจสอบด้วย Browser:

1. เปิด DevTools > Console
2. Login ด้วยบัญชีทดสอบ
3. เปลี่ยนจังหวัดในหน้า Profile
4. กลับหน้าแรกและตรวจสอบการ์ดสถานที่เสี่ยง
5. ตรวจสอบกรณี API ล่มว่ามี Loading/Fallback และไม่มีค่า `-`, `null` หรือ `NaN`
6. ทดสอบหน้าจอมือถือและการใช้งานด้วย Keyboard

## ลำดับการแก้ไขที่แนะนำ

1. แก้เอกสาร Theme ให้ตรงกับ UI
2. รวมสี Hardcode เป็น CSS Variables
3. ปิด Debug Console ใน Production
4. แยก Bundle ด้วย Lazy Loading
5. ให้ผู้เชี่ยวชาญตรวจทานเกณฑ์สุขภาพและข้อความคำแนะนำ
6. เพิ่ม End-to-End Test บน Browser สำหรับ Login, Assessment, Profile และ PM2.5 Card

## ข้อจำกัดของ Audit

การตรวจสอบครั้งนี้เป็น Static Audit และ Automated Build/Test ภายในเครื่อง ยังไม่ได้ทดสอบ API จริงทุกจังหวัดแบบ End-to-End และยังไม่ได้ทดสอบ Payment/Checkout เนื่องจากไม่มีฟีเจอร์ดังกล่าวในระบบ
