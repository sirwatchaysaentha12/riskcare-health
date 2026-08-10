import { useNavigate } from 'react-router-dom'

function Dashboard() {
  const navigate = useNavigate()

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <div className="brand-mark dashboard-brand">RISK<span>CARE</span></div>
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
            <strong>ยังไม่มีข้อมูล</strong>
            <p>เริ่มทำแบบประเมินเพื่อดูระดับความเสี่ยงของคุณ</p>
            <button type="button" onClick={() => navigate('/assessment')}>เริ่มประเมิน</button>
          </article>
          <article className="dashboard-card">
            <span className="card-label">คำแนะนำสุขภาพ</span>
            <strong>ดูแลระบบทางเดินหายใจ</strong>
            <p>ติดตามอาการและดูแลสุขภาพอย่างสม่ำเสมอ</p>
          </article>
        </div>
      </section>
    </main>
  )
}

export default Dashboard