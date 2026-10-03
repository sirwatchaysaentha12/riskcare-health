import { Link } from 'react-router-dom'

function ExerciseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 13h4l2.5-6 4 11 3-7.5 1.6 2.5H22" />
    </svg>
  )
}

function MedicineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)" />
      <path d="M8.5 8.5l7 7" />
    </svg>
  )
}

const tools = [
  {
    to: '/exercise-plan',
    icon: <ExerciseIcon />,
    title: 'แผนการออกกำลังกาย',
    detail: 'วางแผนตามข้อมูลร่างกาย ความเสี่ยงโรคทางเดินหายใจ และ AQI',
  },
  {
    to: '/health-tracker',
    icon: <MedicineIcon />,
    title: 'ติดตามสุขภาพ ยา และนัดพบแพทย์',
    detail: 'บันทึกอาการ เลือกวันนัดหมาย และจัดการรายละเอียดการพบแพทย์',
  },
]

export default function HealthPlanning() {
  return <main className="health-planning-page">
    <header className="health-planning-header"><Link to="/" className="health-planning-back">← กลับหน้าหลัก</Link><h1>การวางแผนเพื่อสุขภาพ</h1><p>เลือกเครื่องมือที่ต้องการใช้งาน ระบบจะเปิดเป็นหน้าเต็มจอแยกจากหน้านี้</p></header>
    <section className="health-planning-grid">
      {tools.map((tool) => <Link className="health-plan-card health-plan-card-link" key={tool.to} to={tool.to}><span className="health-plan-icon">{tool.icon}</span><strong>{tool.title}</strong><small>{tool.detail}</small><b>เริ่มใช้งาน</b></Link>)}
    </section>
  </main>
}
