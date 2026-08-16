# Authentication Surface

- Route: `/login`
- Purpose: เข้าสู่ระบบด้วย Email, Username หรือ Phone
- Secondary action: สมัครสมาชิก
- Data: Supabase Auth และ `profiles`
- States: loading, unknown account, invalid password, registration success, validation error
- Accessibility: input ต้องมี placeholder/label ชัดเจน ปุ่มต้องมี disabled state ระหว่างส่งข้อมูล
