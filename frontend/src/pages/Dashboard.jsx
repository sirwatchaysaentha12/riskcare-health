import { useNavigate } from 'react-router-dom'
import LogoIcon from '../components/LogoIcon'

function Dashboard() {
  const navigate = useNavigate()

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <LogoIcon className="dashboard-brand" />
          <p>พื้นที่สุขภาพของคุณ</p>
        </div>
        <button className="logout-button" type="button" onClick={() => navigate('/login')}>
          ออกจากระบบ
        </button>
      </header>
      <section className="dashboard-content">
        <p className="eyebrow">ภาพรวมวันนี้</p>
        <h1>สวัสดี ยินดีต้อนรับสู่ RiskCare</h1>
        <div className="dashboard-grid">
          <article className="dashboard-card dashboard-card-primary">
            <span className="card-label">การประเมินล่าสุด</span>
            <strong>ยังไม่มีผลประเมิน</strong>
            <p>ทำแบบประเมินสั้น ๆ เพื่อดูระดับความเสี่ยงที่เหมาะกับคุณ</p>
            <button type="button" onClick={() => navigate('/assessment')}>เริ่มทำแบบประเมิน</button>
          </article>
          <article className="dashboard-card">
            <span className="card-label">คำแนะนำสุขภาพ</span>
            <strong>ดูแลระบบทางเดินหายใจ</strong>
            <p>ติดตามอาการ ดูแลสุขภาพ และสังเกตคำแนะนำจากระบบอย่างสม่ำเสมอ</p>
          </article>
        </div>
      </section>
    </main>
  )
}

export default Dashboard
