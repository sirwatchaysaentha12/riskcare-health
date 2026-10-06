import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { NAV_SECTIONS } from '../config/navigation'
import { supabase } from '../lib/supabase'

/* ─── PageMenuButton — ปุ่มแถบสามขีด (☰) มุมขวาบน สำหรับหน้าที่ไม่มี sidebar ให้ครบ
 * กดแล้วเปิดแผงเมนู: ทุกหน้า + ข้อมูลผู้ใช้ + ออกจากระบบ + เวอร์ชันระบบ
 * ใช้ใน: /breathing-check (หน้าเก่า) — ปิดเมื่อคลิกนอกแผง / กด Escape / เปลี่ยนหน้า
 */

export default function PageMenuButton({ username = '' }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { setOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!open) return
    function onDocClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleLogout() {
    setOpen(false)
    await supabase?.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="page-menu" ref={menuRef}>
      <button
        className="page-menu-button"
        type="button"
        aria-label="เปิดเมนูนำทางและการตั้งค่า"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div className="page-menu-panel" role="menu" aria-label="เมนูนำทางและการตั้งค่า">
          <div className="page-menu-user">
            <span className="page-menu-avatar" aria-hidden="true">{(username || 'ผ').trim().charAt(0).toUpperCase()}</span>
            <span className="page-menu-username">{username || 'ผู้ใช้งาน'}</span>
            <span className="page-menu-app">RiskCARE-Health</span>
          </div>

          {NAV_SECTIONS.map((section) => (
            <div className="page-menu-section" key={section.id}>
              <p className="page-menu-section-label">{section.label}</p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to + item.label}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `page-menu-item${isActive ? ' is-active' : ''}`}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}

          <div className="page-menu-footer">
            <p className="page-menu-note">
              แอปพลิเคชันต้นแบบคัดกรองสัญญาณเบื้องต้น — ไม่ใช่การวินิจฉัยโรค<br />
              ผล BIDMC Track A: MAE 9.03 · Bias +8.92 · Clinical Accuracy: Not Validated
            </p>
            <button className="page-menu-logout" type="button" onClick={handleLogout} role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
