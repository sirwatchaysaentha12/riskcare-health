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
      {drawer && <><div className="drawer-backdrop" onClick={() => setDrawer(false)} /><aside className="home-drawer" role="dialog" aria-label="เมนูผู้ใช้"><div className="drawer-profile"><button className="drawer-avatar-button" type="button" onClick={() => avatarInputRef.current?.click()} aria-label="เปลี่ยนรูปโปรไฟล์"><span className="drawer-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : 'U'}</span><span className="avatar-camera">📷</span></button><input ref={avatarInputRef} className="avatar-file-input" type="file" accept="image/jpeg,image/png" onChange={handleAvatarChange} /><div><strong>{profile.full_name || 'ผู้ใช้งาน'}</strong><small>บัญชีของฉัน</small></div><button type="button" onClick={() => setDrawer(false)}>⚙️</button></div><nav>{[['👤','ข้อมูลส่วนตัว','/profile'],['📋','ประวัติการประเมิน','/history']].map(([icon, label, to]) => <Link key={to} to={to} onClick={() => setDrawer(false)}>{icon}<span>{label}</span></Link>)}</nav><button className="drawer-logout" type="button" onClick={async () => { setDrawer(false); if (supabase) await supabase.auth.signOut(); window.location.assign('/login') }}>🚪 ออกจากระบบ</button></aside></>}

      {/* ─── Hero Section ─── */}
      <main>
        <section className="home-hero">
          <div className="hero-card">
            <div className="hero-content">
              <h1>คัดกรองความเสี่ยงระบบทางเดินหายใจ ด้วยมาตรฐานสากล</h1>
              <p>
                ประเมินปัจจัยเสี่ยงส่วนบุคคล ประวัติสุขภาพ และการสัมผัสมลพิษในชีวิตประจำวัน
                รับคำแนะนำสอดคล้องตามแนวทาง W3C, GINA และ WHO
              </p>
              <div className="hero-actions">
                <Link to="/assessment" className="btn-hero-primary">
                  ทำแบบประเมินความเสี่ยง
                </Link>
                <Link to="/health-planning" className="btn-health-planning">
                  การวางแผนเพื่อสุขภาพ
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Live PM2.5 risk alert (real station data) ─── */}
        <section className="home-section" id="outdoor-risk-alert">
          <Pm25AlertCard />
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
