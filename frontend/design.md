# Design — RiskCare (frontend)

ระบบดีไซน์ล็อกสำหรับทุกหน้าของแอป ทุกครั้งที่แก้/เพิ่มหน้า ให้อ่านไฟล์นี้ก่อน
ห้ามสร้างธีมใหม่ต่อหน้า — ถ้าระบบต้องเติบโต ให้แก้ไฟล์นี้แทน

## Genre
modern-minimal (แอปสุขภาพ/ข้อมูล — ความน่าเชื่อถือมาก่อน ความสว่างของเอฟเฟกต์ไม่จำเป็น)

## Theme — RiskCare Emerald (แบรนด์เดิม คงไว้)
Anchor ที่ `index.css` `:root`:

- `--color-primary` `#10B981` — เขียว emerald (accent เท่านั้น)
- `--color-primary-hover` `#059669` — สีปุ่ม primary จริง
- `--color-primary-dark` `#047857` — ตัวอักษรบนพื้นอ่อน
- `--color-primary-light` `#ECFDF5` — พื้นหลัง accent อ่อน
- Paper: `#FFFFFF` (การ์ด) บน `#F8FAFC` (พื้นหน้า)
- Ink: `#0F172A` (หัวเรื่อง) / `#334155` (เนื้อความ) / `#64748B` (รอง)
- Rule: `#E2E8F0` เส้น 1px เท่านั้น — ห้ามขอบ 1.5/2px

กฎการใช้เขียว: ≤ 5% ของ viewport (ปุ่มหลัก, active nav, ลิงก์, focus ring) — เขียวไม่ใช่สีพื้นหน้า

## Typography
- Display/Headings: Prompt 600–700 (ห้าม 800)
- Body: Noto Sans Thai 400 / Prompt 400–500
- ไม่มี uppercase + letter-spacing กับป้ายกำกับ (eyebrow แบบ AI) — ป้ายไทยใช้ 13px 600 สีเทา
- Heading scale: h1 `clamp(24px, 3vw, 34px)`, h2 `20–22px` — ไม่ยืดตัวเลข

## Spacing / Shape
- รัศมี: การ์ด 16px · ปุ่ม/ช่องกรอก 10px · chip/pill 999px — จบ 3 ค่า
- เงา: `var(--shadow)` ตัวเดียว (จาก index.css) — ห้าม glow สีเขียว, ห้ามเงาซ้อน
- ขอบการ์ด 1px `--color-neutral-200` — ไม่ใช้ขอบสองชั้น

## Motion
- Motion-cut: ไม่มี entrance animation, ไม่มี hover ลอย (`translateY`)
- Hover ของปุ่ม = เปลี่ยนสีพื้น/ขอบเท่านั้น · transition 180ms ease
- `prefers-reduced-motion` เคารพอยู่แล้วที่ index.css

## Microinteractions stance
- Silent success — ไม่มี toast ฉลอง
- Focus ring: `outline: 2px solid var(--color-primary)` ทันที (ไม่ animate)

## CTA voice
- Primary: พื้นทึบ `--color-primary-dark` (#047857) ตัวขาว ไม่มี gradient/ไอคอนลูกศร — hover `#065F46`
  (เปลี่ยนจาก #059669 ในปี 2026-10-02 เพราะขาวบน #059669 มี contrast 3.76:1 ไม่ผ่าน WCAG AA)
- Secondary: ขอบ `--color-neutral-300` พื้นขาว — hover ขอบเป็นเขียว
- ห้ามเกิน 2 CTA ต่อส่วน (hero ใช้ 2)

## สิ่งที่ทุกหน้าต้องเหมือนกัน
- ฟอนต์ Prompt + Noto Sans Thai · สีเขียว emerald · ปุ่ม 3 สถานะตามข้างบน
- Navbar เส้นล่าง 1px, active nav = พื้น `--color-primary-light`
- `.eyebrow` = ป้ายเทาเล็ก ไม่มีขีด, ไม่ uppercase

## สิ่งที่แต่ละหน้าต่างกันได้
- โครงสร้างเนื้อหาภายใน, จำนวน/ลำดับ section — แต่เสียงของปุ่ม/การ์ด/สีต้องเป็นระบบนี้

## ข้อห้าม (สิ่งที่เคยทำให้ดู "AI ออกแบบ")
- ปุ่ม gradient + box-shadow สี + hover translateY
- อีโมจิเป็น hero graphic หรือไอคอนหลักของการ์ด (แถวข้อมูลยอมให้ได้ แต่ห้ามเป็นหน้าด้าน)
- ป้าย pill จุดกะพริบ / badge "กำลังเตรียมระบบ" ตกแต่ง
- ตัวเลข/ข้อมูลตัวอย่างปลอมใน UI จริง (ต้องมาจาก API หรือแสดงสถานะ "รอข้อมูล")
- eyebrow ภาษาอังกฤษตัวพิมพ์ใหญ่ซ้ำกับ h1

## Exports

### tokens.css (ชี้กลับไฟล์เดิม — แหล่งจริงคือ index.css)
สี/ฟอนต์/เงา อยู่ที่ `src/index.css` `:root` อยู่แล้ว ห้ามสร้างชุดขนาน

### shadcn/ui mapping (อ้างอิง)
```css
:root {
  --background: #FFFFFF;         /* card paper */
  --foreground: #0F172A;         /* ink */
  --primary: #047857;            /* accent (AA-contrast green) */
  --primary-foreground: #FFFFFF;
  --muted: #F1F5F9;
  --muted-foreground: #64748B;
  --border: #E2E8F0;
  --input: #E2E8F0;
  --ring: #10B981;
  --radius: 10px;
}
```
