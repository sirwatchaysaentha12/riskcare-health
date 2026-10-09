# คู่มือทดสอบจริง — Phase 2 Camera Safety/Quality

เอกสารนี้ใช้เก็บผลทดสอบจาก browser และกล้องจริงเท่านั้น Unit test หรือการตรวจ source ไม่สามารถใช้แทนผลเหล่านี้ได้ ห้ามเริ่ม Phase 3 จนกว่าจะทบทวนผล Phase 2 และได้รับอนุมัติ

## A. เปิดเว็บบน Windows

เปิด PowerShell หน้าต่างแรก:

```powershell
cd C:\Users\ACER\projectweb\frontend
npm run dev
```

เปิด URL ที่ Vite แสดง โดยปกติคือ `http://localhost:5173/breathing-check` หากมีการเลือก port อื่น ให้ใช้ port ที่แสดงใน terminal แทน ต้องใช้ `localhost` หรือ HTTPS เพื่อให้ browser อนุญาตกล้อง

### ถ้าพบ `npm error Missing script: "dev"`

ตรวจสอบว่าอยู่ใน `frontend` ไม่ใช่ project root: root มี `package.json` แต่ไม่มี scripts ส่วน `frontend/package.json` มี `"dev": "vite"` อยู่แล้ว จึงไม่ต้องเพิ่มหรือแก้ script

PowerShell:

```powershell
Set-Location 'C:\Users\ACER\projectweb\frontend'
Get-Location
Test-Path .\package.json
npm run
npm run dev
```

Command Prompt:

```bat
cd /d C:\Users\ACER\projectweb\frontend
dir package.json
npm run
npm run dev
```

ก่อนรัน `npm run dev` ให้ตรวจว่า path ลงท้ายด้วย `\frontend` และ `npm run` แสดง script `dev` ใช้ URL/port ที่ Vite พิมพ์ออกมา

## B. Permission และวงจรกล้อง

ทดสอบทีละข้อ:

1. เปิดหน้าโดยยังไม่ติ๊กยินยอม ตรวจว่ากล้องยังไม่เปิดและไม่มี permission prompt
2. ติ๊กยินยอมและกด “ยินยอมและเปิดกล้อง”; เลือก Allow และตรวจว่ามีภาพ preview
3. เปิดหน้าใหม่ เลือก Block/Deny ตรวจข้อความผิดพลาดและลองปุ่ม Retry
4. เปลี่ยน permission ของเว็บไซต์เป็น Allow แล้วลองใหม่
5. ขณะ preview ทำงาน ปิดกล้อง/ถอดกล้อง แล้วตรวจว่ามีข้อความแจ้งและลองใหม่ได้
6. ออกจากหน้า ตรวจว่าไฟกล้องดับ จากนั้นกลับเข้าหน้าและทดสอบขอสิทธิ์ใหม่

## C. Camera Quality Gate

ทดสอบกรณีต่อไปนี้ทีละกรณี ตรวจคำแนะนำและยืนยันว่าปุ่มเริ่มวัดไม่เปิดเมื่อภาพยังไม่พร้อม:

- แสงปกติ
- แสงน้อย
- ภาพเบลอ
- กล้องหรือผู้ใช้เคลื่อนไหว
- ผู้ใช้/ช่วงอกอยู่นอกกรอบ
- หันข้าง
- มีสิ่งบังบริเวณลำตัว
- จัดภาพให้ผ่าน gate แล้วตรวจว่าปุ่มเริ่มวัดเปิดใช้งาน
- เมื่อภาพไม่ผ่าน ตรวจว่าปุ่มตรวจภาพอีกครั้ง/Retry ทำงาน

ตัวตรวจเป็น heuristic จากภาพและ pose landmarks ไม่ใช่การวัดคุณภาพทางการแพทย์ หากผลไม่สอดคล้องกับสภาพจริงให้บันทึก FAIL พร้อมข้อความที่แสดง ห้ามฝืนเริ่มวัดเพื่อทำให้ผลดูผ่าน

## D. Responsive และ Keyboard

- ทดสอบ Desktop Chrome หรือ Edge และจดชื่อ/รุ่น browser
- ทดสอบ Mobile viewport หรืออุปกรณ์มือถือจริง
- ใช้ Tab ไปยัง Consent, ปุ่มเปิดกล้อง และ Retry; ตรวจว่า focus ring มองเห็น
- ใช้ Enter/Space กับ checkbox และปุ่ม
- ตรวจว่า navigation และปุ่ม “ประเมินด้วยกล้อง” ไม่ล้นหรือทับเนื้อหา

## E. ตรวจ Privacy ผ่าน DevTools

หลังยินยอมและระหว่าง preview:

- Console ต้องไม่มีภาพ วิดีโอ เสียง หรือข้อมูลสุขภาพ
- Network ต้องไม่มีการอัปโหลดภาพ/วิดีโอที่ไม่ได้แจ้งไว้ (การดาวน์โหลด library/model เป็น request ภายนอกที่แยกต่างหาก)
- ไม่มี API key หรือ secret ใน URL/Frontend
- ออกจากหน้าแล้วตรวจว่าไฟกล้องดับ
- อย่าส่งภาพใบหน้า ภาพจากกล้อง หรือข้อมูลสุขภาพกลับมา

## ตารางบันทึกผล

กรอก PASS/FAIL หลังทดสอบจริง หากทดสอบไม่ได้ให้ใส่ `NOT RUN` และเหตุผล ห้ามคาดเดาผล:

| Test | Browser/Device | Expected result | PASS/FAIL/NOT RUN | Note (ไม่มีข้อมูลส่วนตัว) |
|---|---|---|---|---|
| เปิดหน้าโดยไม่ยินยอม |  | กล้องยังไม่เปิดและไม่มี permission prompt |  |  |
| Consent แล้วกด Allow |  | Permission ผ่านและมีภาพ preview |  |  |
| กด Deny/Block |  | แสดง error ที่เข้าใจได้และมี Retry |  |  |
| เปลี่ยน permission กลับเป็น Allow |  | ขอสิทธิ์/เปิดกล้องใหม่ได้ |  |  |
| ปิดกล้องระหว่างใช้งาน |  | แจ้ง error และหน้าไม่ค้าง |  |  |
| แสงปกติ |  | Quality Gate ผ่านเมื่อเกณฑ์อื่นพร้อม |  |  |
| แสงน้อย |  | แจ้งเพิ่มแสงและไม่ให้เริ่มวัด |  |  |
| ภาพเบลอ |  | แจ้งแก้ภาพและไม่ให้เริ่มวัด |  |  |
| กล้องหรือผู้ใช้เคลื่อนไหว |  | แจ้งให้นิ่งและไม่ให้เริ่มเมื่อไม่ผ่าน |  |  |
| ผู้ใช้/ช่วงอกอยู่นอกเฟรม |  | แจ้งจัดตำแหน่งและไม่ให้เริ่มเมื่อไม่ผ่าน |  |  |
| ผู้ใช้หันข้าง |  | แสดงคำแนะนำหันช่วงอกเข้ากล้อง |  |  |
| มีสิ่งบังช่วงอก |  | แจ้งว่าจุดลำตัวมองไม่เห็น/อาจถูกบัง |  |  |
| ภาพผ่าน Quality Gate |  | ปุ่มเริ่มวัดเปิดใช้งาน |  |  |
| ออกจากหน้า |  | Camera Track หยุดและไฟกล้องดับ |  |  |
| Desktop layout |  | เนื้อหาและ Navigation ไม่ล้นหรือซ้อน |  |  |
| Mobile viewport/อุปกรณ์จริง |  | เนื้อหาและปุ่มใช้งานได้โดยไม่ล้น |  |  |
| Keyboard Tab/Enter/Space |  | เข้าถึงและใช้ controls ได้ พร้อม focus ring |  |  |
| ตรวจ Network |  | ไม่พบการอัปโหลดภาพ/วิดีโอโดยไม่แจ้ง |  |  |
| ตรวจ Console |  | ไม่มีภาพ/เสียง/ข้อมูลสุขภาพใน log |  |  |

## ส่งผลกลับเพื่อทบทวน

ส่งตาราง PASS/FAIL, browser/version, ระบบปฏิบัติการ, ขนาดหน้าจอโดยประมาณ และ error message ที่ไม่มีข้อมูลส่วนตัวก็เพียงพอ ไม่ต้องส่ง screenshot ที่เห็นใบหน้าหรือภาพกล้อง หากจำเป็นต้องแนบภาพ UI/DevTools ให้ปิดข้อมูลส่วนบุคคลก่อน

คัดลอกแบบฟอร์มสรุปนี้แล้วกรอกได้:

```text
Browser/Version:
Device/OS:
Screen size (approx.):
URL tested:

No camera before Consent: PASS/FAIL/NOT RUN
Permission Allow: PASS/FAIL/NOT RUN
Permission Deny: PASS/FAIL/NOT RUN
Low light: PASS/FAIL/NOT RUN
Blur: PASS/FAIL/NOT RUN
Camera movement: PASS/FAIL/NOT RUN
Chest outside frame: PASS/FAIL/NOT RUN
Turned side/obstruction: PASS/FAIL/NOT RUN
Camera removed during use: PASS/FAIL/NOT RUN
Camera stops on exit: PASS/FAIL/NOT RUN
Desktop layout: PASS/FAIL/NOT RUN
Mobile layout: PASS/FAIL/NOT RUN
Keyboard navigation: PASS/FAIL/NOT RUN
Console privacy: PASS/FAIL/NOT RUN
Network privacy: PASS/FAIL/NOT RUN

Error messages (without secrets or personal data):
Notes:
```

สถานะ Phase 2 จะยังเป็น PARTIAL จนกว่าจะมีผลทดสอบจริงอย่างน้อยหนึ่ง browser/device และผ่านเกณฑ์ Permission, Quality Gate, lifecycle, Desktop/Mobile/Keyboard และ Privacy
