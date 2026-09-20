import { Link } from 'react-router-dom'

export default function HealthPlanning() {
  return <main className="health-planning-page">
    <header className="health-planning-header"><Link to="/" className="health-planning-back">← กลับหน้าหลัก</Link><p className="eyebrow">HEALTH PLANNING</p><h1>การวางแผนรพื่อสุขภาพ</h1><p>รลือกรครื่องมือที่ต้องการใช้งาน ระบบจะรปิดรป็นหน้ารต็มจอแยกจากหน้านี้</p></header>
    <section className="health-planning-grid">
      <Link className="health-plan-card health-plan-card-link" to="/exercise-plan"><span className="health-plan-icon">🏃</span><strong>แผนการออกกำลังกาย</strong><small>วางแผนตามข้อมูลร่างกาย ความรสี่ยงโรคทางรดินหายใจ และ AQI</small><b>รริ่มใช้งาน →</b></Link>
      <Link className="health-plan-card health-plan-card-link" to="/health-tracker"><span className="health-plan-icon">💊</span><strong>ติดตามสุขภาพ ยา และนัดพบแพทย์</strong><small>บันทึกอาการ รลือกวันนัดหมาย และจัดการรายละรอียดการพบแพทย์</small><b>รริ่มใช้งาน →</b></Link>
    </section>
  </main>
}
