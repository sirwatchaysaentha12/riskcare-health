import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import Pm25AlertCard from '../components/Pm25AlertCard'
import { supabase } from '../lib/supabase'

function Home() {
  const [drawer, setDrawer] = useState(false)
  const [profile, setProfile] = useState({ full_name: 'ผู้ใช้งาน', avatar_url: localStorage.getItem('riskcare_avatar_url') || '' })
  const avatarInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      if (!supabase) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle()
      if (!cancelled && data) setProfile({ ...data, avatar_url: data.avatar_url || localStorage.getItem('riskcare_avatar_url') || '' })
    }
    loadProfile()
    return () => { cancelled = true }
  }, [])

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file || !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const preview = String(reader.result)
      setProfile((current) => ({ ...current, avatar_url: preview }))
      localStorage.setItem('riskcare_avatar_url', preview)
      if (!supabase) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const path = `${user.id}/avatar-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (!error) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
        setProfile((current) => ({ ...current, avatar_url: data.publicUrl }))
      }
    }
    reader.readAsDataURL(file)
  }
  return (
    <div className="home-page">
      {/* ─── Navbar Header ─── */}
      <header className="home-navbar">
        <button className="drawer-trigger" type="button" aria-label="เปิดเมนู" onClick={() => setDrawer(true)}>☰</button>
        <nav>
          <ul className="home-nav-links">
            <li><Link to="/dashboard">ภาพรวม</Link></li>
            <li><Link to="/assessment">ประเมินความเสี่ยง</Link></li>
          </ul>
        </nav>

        <div className="home-header-actions">
          <Link to="/assessment" className="btn-nav-primary">
            เริ่มประเมินความเสี่ยง →
          </Link>
        </div>
      </header>
      {drawer && <><div className="drawer-backdrop" onClick={() => setDrawer(false)} /><aside className="home-drawer" role="dialog" aria-label="เมนูผู้ใช้"><div className="drawer-profile"><button className="drawer-avatar-button" type="button" onClick={() => avatarInputRef.current?.click()} aria-label="เปลี่ยนรูปโปรไฟล์"><span className="drawer-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : 'U'}</span><span className="avatar-camera">📷</span></button><input ref={avatarInputRef} className="avatar-file-input" type="file" accept="image/jpeg,image/png" onChange={handleAvatarChange} /><div><strong>{profile.full_name || 'ผู้ใช้งาน'}</strong><small>บัญชีของฉัน</small></div><button type="button" onClick={() => setDrawer(false)}>⚙️</button></div><nav>{[['👤','ข้อมูลส่วนตัว','/profile'],['📋','ประวัติการประเมิน','/history']].map(([icon, label, to]) => <Link key={to} to={to} onClick={() => setDrawer(false)}>{icon}<span>{label}</span></Link>)}</nav><button className="drawer-logout" type="button" onClick={async () => { setDrawer(false); if (supabase) await supabase.auth.signOut(); window.location.assign('/login') }}>🚪 ออกจากระบบ</button></aside></>}

      {/* ─── Hero Section ─── */}
      <main>
        <section className="home-hero">
          <div className="hero-card">
            <div className="hero-content">
              <div className="hero-tag">
                <span /> ระบบประเมินสุขภาพทางเดินหายใจ
              </div>
              <h1>คัดกรองความเสี่ยงระบบทางเดินหายใจ ด้วยมาตรฐานสากล</h1>
              <p>
                ประเมินปัจจัยเสี่ยงส่วนบุคคล ประวัติสุขภาพ และการสัมผัสมลพิษในชีวิตประจำวัน 
                รับคำแนะนำสอดคล้องตามแนวทาง W3C, GINA และ WHO
              </p>
              <div className="hero-actions">
                <Link to="/assessment" className="btn-hero-primary">
                  ทำแบบประเมินความเสี่ยง <span>→</span>
                </Link>
                <Link to="/dashboard" className="btn-hero-secondary">
                  ดูภาพรวมข้อมูล
                </Link>
              </div>
            </div>

            <div className="hero-graphic">
              <div className="hero-graphic-icon">🫁</div>
              <p>การคัดกรองเบื้องต้นเพื่อสุขอนามัยทางเดินหายใจที่ดีขึ้น</p>
            </div>
          </div>
        </section>

        {/* ─── Prepared Outdoor Activity Risk Notification Section ─── */}
        <section className="home-section" id="outdoor-risk-alert">
          <Pm25AlertCard />
          <div className="outdoor-alert-card">
            <div className="outdoor-alert-header">
                <div className="outdoor-alert-title">
                <div className="icon-badge">🌤️</div>
                <div>
                  <h2>คำแนะนำกิจกรรมกลางแจ้ง</h2>
                  <p style={{ margin: '2px 0 0', color: 'var(--color-neutral-600)', fontSize: '13px' }}>
                    ระบบจะแนะนำการทำกิจกรรมกลางแจ้งตามค่าฝุ่นและความเสี่ยงของคุณ
                  </p>
                </div>
              </div>
              <span className="upcoming-badge">กำลังเตรียมระบบ</span>
            </div>

            {/* Placeholder Indicator Cards */}
            <div className="outdoor-grid">
              <div className="outdoor-item">
                <label>ค่าฝุ่น PM2.5 (ข้อมูลตัวอย่าง)</label>
                <strong>28.4 µg/m³</strong>
                <span>ระดับคุณภาพอากาศปานกลาง</span>
              </div>
              <div className="outdoor-item">
                <label>ดัชนี AQI (ข้อมูลตัวอย่าง)</label>
                <strong>78 AQI</strong>
                <span>เหลือง (Moderate)</span>
              </div>
              <div className="outdoor-item">
                <label>คำแนะนำกิจกรรมนอกสถานที่</label>
                <strong>ควรลดกิจกรรมหนักกลางแจ้ง</strong>
                <span>สวมหน้ากาก N95 เมื่ออยู่กลางแดดนาน</span>
              </div>
            </div>

            <div className="outdoor-notice-bar">
                <strong>หมายเหตุ:</strong>
              <span>
                ค่าที่แสดงในส่วนนี้เป็นข้อมูลตัวอย่าง ยังไม่ใช่ค่าฝุ่นแบบเรียลไทม์
              </span>
            </div>
          </div>
        </section>

      </main>

      {/* ─── Footer ─── */}
      <footer className="home-footer">
        <div className="footer-container">
          <div className="footer-copy">
            © 2026 RiskCare. สงวนลิขสิทธิ์ตามกฎหมาย
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home
