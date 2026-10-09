import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './icons'
import { supabase } from '../lib/supabase'
import { getStationsMeta } from '../services/airQuality'

// Header v2 (port จาก stitch-design/code.html) — hamburger + logo + live pill
// + กระดิ่งแจ้งเตือน + เมนูบัญชี ทุกค่าที่แสดงมาจากข้อมูลจริง (stations meta / Supabase)
export default function AppHeaderV2({ onMenuClick }) {
  const [openPanel, setOpenPanel] = useState(null) // 'notif' | 'user' | null
  const [username, setUsername] = useState('')
  const [metaStale, setMetaStale] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    supabase?.auth.getUser().then(({ data }) => {
      if (!cancelled) setUsername(data?.user?.user_metadata?.username || '')
    })
    return () => { cancelled = true }
  }, [])

  // สถานะข้อมูลจริงจาก stations gateway — อ่าน meta ที่ getAirQualityStations เก็บไว้
  useEffect(() => {
    const timer = setInterval(() => {
      const meta = getStationsMeta()
      setMetaStale(Boolean(meta?.stale || meta?.air4thai?.stale))
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    function onDocClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpenPanel(null)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpenPanel(null)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const initial = username ? username.trim().charAt(0).toUpperCase() : 'ผ'

  return (
    <header className="rc2-header">
      <div className="rc2-header-inner" ref={rootRef}>
        <div className="rc2-header-brand">
          <button
            type="button"
            className="rc2-icon-btn"
            aria-label="เปิดเมนูหลัก"
            aria-controls="rc2-sidebar-drawer"
            onClick={onMenuClick}
          >
            <Icon name="menu" size={24} />
          </button>
          <Link to="/" aria-label="RiskCARE-Health หน้าหลัก" className="rc2-brand">
            <span className="rc2-brand-badge"><Icon name="lungs" size={22} filled /></span>
            <span className="rc2-brand-col">
              <span className="rc2-header-brand-row">
                <span className="rc2-header-brand-name">RiskCARE-Health</span>
                <span className="rc2-live-chip">Live Telemetry</span>
              </span>
              <span className="rc2-header-sub">ระบบรายงานคุณภาพอากาศระดับจังหวัด</span>
            </span>
          </Link>
        </div>

        <div className="rc2-header-actions">
          <span className={`rc2-live-pill${metaStale ? ' is-stale' : ''}`}>
            <span className={`rc2-live-dot${metaStale ? ' is-stale' : ''}`} />
            {metaStale ? 'ข้อมูลล่าสุดล้าสมัย' : 'Live Air Telemetry'}
          </span>

          <div className="rc2-notif-wrap">
            <button
              type="button"
              className="rc2-icon-btn"
              aria-label="ดูสถานะข้อมูลตรวจวัดล่าสุด"
              aria-expanded={openPanel === 'notif'}
              onClick={() => setOpenPanel(openPanel === 'notif' ? null : 'notif')}
            >
              <Icon name="notifications" size={22} />
              <span className="rc2-notif-dot" aria-hidden="true" />
            </button>
            {openPanel === 'notif' && (
              <div className="rc2-dropdown" role="dialog" aria-label="สถานะข้อมูลตรวจวัด">
                <div className="rc2-dropdown-head">
                  <span className="rc2-dropdown-title">สถานะข้อมูลตรวจวัด</span>
                  <button type="button" className="rc2-icon-btn" onClick={() => setOpenPanel(null)}>ปิด</button>
                </div>
                <div className="rc2-dropdown-list">
                  <div className={`rc2-notif-item${metaStale ? ' is-alert' : ''}`}>
                    <Icon name={metaStale ? 'warning' : 'sync'} size={20} className="rc2-notif-item-icon" />
                    <div>
                      <p className="rc2-notif-item-title">
                        {metaStale ? 'ข้อมูลล่าสุดล้าสมัย' : 'เชื่อมต่อข้อมูลปกติ'}
                      </p>
                      <p className="rc2-notif-item-body">
                        {getStationsMeta()?.note || 'ดึงค่าคุณภาพอากาศล่าสุดตามพื้นที่ของคุณ'}
                      </p>
                    </div>
                  </div>
                  <div className="rc2-notif-item">
                    <Icon name="analytics" size={20} />
                    <div>
                      <p className="rc2-notif-item-title">มาตรฐานข้อมูล</p>
                      <p className="rc2-notif-item-body">ตรวจวัดและประมวลผลตามมาตรฐานระดับประเทศ</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rc2-avatar-wrap">
            <button
              type="button"
              className="rc2-avatar"
              aria-label="เปิดเมนูบัญชีผู้ใช้งาน"
              aria-expanded={openPanel === 'user'}
              onClick={() => setOpenPanel(openPanel === 'user' ? null : 'user')}
            >
              {initial}
            </button>
            {openPanel === 'user' && (
              <div className="rc2-dropdown rc2-dropdown--user" role="dialog" aria-label="เมนูบัญชีผู้ใช้งาน">
                <div className="rc2-dropdown-item is-static" style={{ display: 'flex' }}>
                  <span className="rc2-user-meta">{username || 'ผู้ใช้งาน'}</span>
                </div>
                <div className="rc2-dropdown-sep" />
                <Link className="rc2-dropdown-item" to="/profile" onClick={() => setOpenPanel(null)}>
                  <Icon name="person" size={18} /> ข้อมูลส่วนตัว
                </Link>
                <Link className="rc2-dropdown-item" to="/dashboard" onClick={() => setOpenPanel(null)}>
                  <Icon name="grid_view" size={18} /> ภาพรวมฝุ่นละเอียด
                </Link>
                <div className="rc2-dropdown-sep" />
                <button
                  type="button"
                  className="rc2-dropdown-item is-danger"
                  onClick={async () => {
                    await supabase?.auth.signOut()
                    window.location.assign('/login')
                  }}
                >
                  <Icon name="logout" size={18} /> ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
