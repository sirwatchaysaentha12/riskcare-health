/* ─── Shared navigation config — ใช้ร่วมกันระหว่าง SidebarNav และ PageMenuButton ─── */

export const NAV_SECTIONS = [
  {
    id: 'main',
    label: 'เมนูหลัก',
    items: [
      { to: '/', label: 'หน้าหลัก', end: true },
      { to: '/dashboard', label: 'ภาพรวมฝุ่น PM2.5' },
      { to: '/air-quality-trend', label: 'แนวโน้มฝุ่นรายวัน' },
      { to: '/hourly-forecast', label: 'ฝุ่นรายชั่วโมง' },
    ],
  },
  {
    id: 'respiratory',
    label: 'สุขภาพทางเดินหายใจ',
    items: [
      { to: '/respiratory-check', label: 'ประเมินความเสี่ยงด้วยกล้องหรือวิดีโอ', badge: 'AI' },
      { to: '/assessment', label: 'แบบประเมินสุขภาพ' },
    ],
  },
  {
    id: 'appointments',
    label: 'นัดหมาย',
    items: [
      { to: '/appointments', label: 'ปฏิทินนัดหมาย' },
    ],
  },
  {
    id: 'account',
    label: 'บัญชีของฉัน',
    items: [
      { to: '/profile', label: 'โปรไฟล์ของฉัน' },
      { to: '/history', label: 'ประวัติการใช้งาน' },
    ],
  },
]
