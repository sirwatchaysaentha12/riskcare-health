# Impeccable UI Critique — RiskCARE

วันที่ตรวจสอบ: 16 สิงหาคม 2026

## ภาพรวม

UI มีโครงสร้างการ์ดและลำดับเนื้อหาชัดเจน โดยเฉพาะการ์ดประเมินและการ์ด PM2.5 แต่ภาพรวมยังมีความไม่สม่ำเสมอระหว่างหน้าหลักกับหน้า Login และมี CSS เก่าซ้อนกับ CSS ใหม่ ทำให้การดูแลและการแสดงผลบนมือถือมีความเสี่ยง

## ประเด็นที่ควรแก้

### 1. Theme ไม่เป็นหนึ่งเดียว — ระดับสูง

หน้าหลักใช้ Green/White แต่หน้า Login ยังใช้ Dark Slate และมี Accent สีฟ้า ทำให้ผู้ใช้รู้สึกว่าเป็นคนละระบบ

วิธีแก้:

- ใช้ Green/White เป็น Theme หลักทุกหน้า
- เปลี่ยน `--slate-*` และ Accent ฟ้าใน `auth.css` ให้ใช้ตัวแปรกลาง
- คงสีแดง/ส้ม/เหลืองไว้เฉพาะสถานะความเสี่ยง ไม่ใช้เป็นสีตกแต่งทั่วไป

### 2. CSS Variables ยังไม่เป็นศูนย์กลาง — ระดับสูง

พบสี Hardcode หลายจุด เช่น `#047857`, `#34d399`, `#fef2f2` และ `rgba(...)` ทำให้ปรับ Theme ได้ไม่ครบ

วิธีแก้:

```css
:root {
  --color-primary: #10B981;
  --color-primary-dark: #059669;
  --color-primary-light: #ECFDF5;
  --color-primary-soft: #D1FAE5;
  --color-text: #0F172A;
  --color-card: #FFFFFF;
  --color-border: #E2E8F0;
  --color-muted: #64748B;
}
```

จากนั้นเปลี่ยนทุกสีใน Component และ CSS ให้เรียกผ่าน `var(--...)`

### 3. Navbar มี CSS ซ้ำและเสี่ยงทับบน Mobile — ระดับกลาง

`.home-navbar` มี `position` และ `z-index` ซ้ำ และเมนูใช้ `position: absolute` เพื่อจัดกึ่งกลาง ซึ่งอาจทับ Brand หรือปุ่ม Drawer บนหน้าจอเล็ก

วิธีแก้:

- เหลือ `position: sticky` และ `z-index` เพียงชุดเดียว
- ใช้ CSS Grid จัด 3 ส่วน: Brand / Menu / Actions
- ปิด Absolute Center บน Breakpoint มือถือ
- ทดสอบความกว้าง 320px, 375px, 768px และ Desktop

### 4. Style เก่าที่ยังหลงเหลือ — ระดับกลาง

พบ Rule ที่ถูกซ้อนท้ายไฟล์ เช่น `.home-header-actions { display: none; }`, Rule `nth-child` และ Style สำหรับปุ่ม/เมนูเดิม ทำให้ผู้ดูแลอ่าน CSS ได้ยากและอาจเกิดผลข้างเคียงเมื่อเพิ่มเมนูใหม่

วิธีแก้:

- ลบ Rule ที่ไม่ได้ใช้
- รวม Rule ของ Component เดียวกันไว้ด้วยกัน
- หลีกเลี่ยง Selector แบบ `nth-child` กับ Navigation
- ใช้ Class ที่สื่อความหมาย เช่น `.nav-overview`, `.nav-profile`

### 5. Focus State ยังไม่สม่ำเสมอ — ระดับกลาง

Input บางส่วนมี Focus Ring แต่ปุ่มและลิงก์บางชุดพึ่งพาเฉพาะ Hover ทำให้ผู้ใช้ Keyboard มองตำแหน่งปัจจุบันได้ยาก

วิธีแก้:

```css
:where(a, button, input, select):focus-visible {
  outline: 3px solid var(--color-primary-soft);
  outline-offset: 2px;
}
```

### 6. Loading และ Error ควรมีรูปแบบเดียวกัน — ระดับกลาง

แต่ละหน้ามีข้อความ Loading/Error ต่างรูปแบบกัน และบางส่วนแสดงสีอย่างเดียว

วิธีแก้:

- สร้าง `LoadingState` และ `ErrorState` Component กลาง
- แสดงข้อความที่เข้าใจง่าย
- เพิ่ม `role="status"` สำหรับ Loading
- เพิ่ม `role="alert"` สำหรับ Error
- ไม่แสดง `-`, `null`, `undefined` หรือ `NaN` ให้ผู้ใช้เห็น

### 7. Typography และระยะห่าง — ระดับต่ำ

บางหน้ามีขนาด Heading และ Padding ต่างกันมาก ทำให้การเปลี่ยนหน้าไม่ต่อเนื่อง

วิธีแก้:

- กำหนด Type Scale กลาง เช่น 12, 14, 16, 20, 24, 32
- ใช้ Spacing Scale เช่น 4, 8, 12, 16, 24, 32
- จำกัดความยาวบรรทัดข้อความคำแนะนำไม่เกินประมาณ 65–75 ตัวอักษรต่อบรรทัด

## สิ่งที่ทำได้ดี

- ใช้ Card แบ่งกลุ่มข้อมูลชัดเจน
- มี Responsive Grid หลายจุด
- ใช้ข้อความร่วมกับสีเพื่อสื่อระดับความเสี่ยง
- มี Loading/Error/Fallback ในระบบข้อมูลฝุ่น
- มี Automated Test สำหรับจังหวัดและ Master Data
- ปุ่มหลักใช้สีเขียวและมีความโดดเด่นเหมาะกับ Product ด้านสุขภาพ

## ลำดับการแก้ไขที่แนะนำ

1. รวม CSS Variables และกำหนด Green/White Theme กลาง
2. แก้หน้า Login ให้ใช้ Theme เดียวกับหน้าหลัก
3. ล้าง CSS ซ้ำและแก้ Navbar เป็น Grid/Responsive
4. เพิ่ม `:focus-visible` ให้ทุก Interactive Element
5. รวม Loading/Error State เป็น Component กลาง
6. ปรับ Typography และ Spacing ให้เป็น Scale เดียวกัน
7. ทดสอบด้วย Keyboard และหน้าจอมือถือหลายขนาด

## Acceptance Checklist

- [ ] ทุกหน้ามีสีและ Typography อยู่ใน Theme เดียวกัน
- [ ] ไม่มีสี Hardcode ที่ควรเป็น Design Token
- [ ] Navbar ไม่ทับกันบนมือถือ
- [ ] ทุกปุ่มกดด้วย Keyboard ได้
- [ ] Focus Ring เห็นชัด
- [ ] Loading/Error ใช้รูปแบบเดียวกัน
- [ ] ไม่มีค่า `-`, `null`, `undefined` หรือ `NaN` หลุดใน UI
- [ ] `npm run lint`, `npm run test:provinces` และ `npm run build` ผ่าน
