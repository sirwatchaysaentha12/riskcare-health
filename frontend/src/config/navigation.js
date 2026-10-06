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
      { to: '/respiratory-risk', label: 'ประเมินความเสี่ยงโรคทางเดินหายใจ' },
      { to: '/breathing-check', label: 'ตรวจการหายใจด้วยกล้อง' },
      { to: '/assessment', label: 'แบบประเมินสุขภาพ 14 ข้อ' },
    ],
  },
  {
    id: 'appointments',
    label: 'นัดหมาย',
    items: [
      { to: '/appointments', label: 'ปฏิทินนัดหมาย' },
      { to: '/add-appointment', label: 'เพิ่มนัดหมาย' },
    ],
  },
  {
    id: 'health-plan',
    label: 'แผนสุขภาพ',
    items: [
      { to: '/health-planning', label: 'แผนสุขภาพส่วนตัว' },
      { to: '/exercise-plan', label: 'โปรแกรมออกกำลังกาย' },
      { to: '/health-tracker', label: 'บันทึกสุขภาพ' },
      { to: '/workout-plan', label: 'แผนออกกำลังกายรายวัน' },
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
