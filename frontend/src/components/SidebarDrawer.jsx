import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Icon from './icons'
import { supabase } from '../lib/supabase'

// Slide-out drawer (port จาก stitch-design/code.html id="app-sidebar")
// ลิงก์ทั้งหมดชี้เฉพาะหน้าที่มีจริงใน App.jsx — จุดต่างจากดีไซน์:
// 1) "ประเมินความเสี่ยงทางเดินหายใจ" ชี้ /respiratory-risk (ดีไซน์ชี้ /assessment ซึ่งซ้ำกับแบบ 14 ข้อ)
// 2) ไม่มี /logout (route ไม่มีจริง) → ใช้ supabase.auth.signOut
// 3) เพิ่มเมนูหน้าจริงที่ดีไซน์ลืม (โปรแกรมออกกำลังกาย / แผนออกกำลังกายรายวัน)
const MENU_SECTIONS = [
  {
    id: 'air',
    label: 'ภาพรวม & ข้อมูลอากาศ',
    items: [
      { to: '/', label: 'หน้าหลัก', icon: 'home', end: true, keywords: 'หน้าหลัก ภาพรวมคุณภาพอากาศ' },
      { to: '/dashboard', label: 'ภาพรวมฝุ่น PM2.5', icon: 'grid_view', keywords: 'ภาพรวมฝุ่น dashboard' },
      { to: '/air-quality-trend', label: 'แนวโน้มฝุ่นรายวัน', icon: 'trending_up', keywords: 'แนวโน้มฝุ่นรายวัน trend' },
      { to: '/hourly-forecast', label: 'ฝุ่นรายชั่วโมง', icon: 'schedule', keywords: 'ฝุ่นรายชั่วโมง พยากรณ์ hourly' },
    ],
  },
  {
    id: 'respiratory',
    label: 'ตรวจวิเคราะห์สุขภาพ',
    items: [
      { to: '/respiratory-check', label: 'ประเมินความเสี่ยงด้วยกล้องหรือวิดีโอ', icon: 'videocam', badge: 'AI', keywords: 'ประเมินความเสี่ยงทางเดินหายใจ ตรวจการหายใจด้วยกล้อง วิดีโอ breathing camera ai' },
      { to: '/assessment', label: 'แบบประเมินสุขภาพ', icon: 'checklist', keywords: 'แบบประเมินสุขภาพ' },
    ],
  },
  {
    id: 'care',
    label: 'การดูแล & การติดตาม',
    items: [
      { to: '/appointments', label: 'ปฏิทินนัดหมาย', icon: 'calendar', keywords: 'ปฏิทินนัดหมาย appointments' },
      { to: '/history', label: 'ประวัติการใช้งาน', icon: 'history', keywords: 'ประวัติการใช้งาน history' },
    ],
  },
  {
    id: 'account',
    label: 'บัญชีของฉัน',
    items: [
      { to: '/profile', label: 'บัญชีของฉัน', icon: 'manage_accounts', keywords: 'บัญชีของฉัน profile โปรไฟล์' },
    ],
  },
]

export default function SidebarDrawer({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [userMeta, setUserMeta] = useState({ name: '', province: '' })
  const location = useLocation()

  // ปิด drawer เมื่อเปลี่ยนหน้า
  useEffect(() => { onClose?.() }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    async function loadUser() {
      const { data: { user } } = await supabase?.auth.getUser?.() ?? {}
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, province')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) {
        setUserMeta({ name: profile?.full_name || user.user_metadata?.username || '', province: profile?.province || '' })
      }
    }
    loadUser()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return MENU_SECTIONS.map((section) => ({ ...section, items: section.items, isEmpty: false }))
    return MENU_SECTIONS.map((section) => {
      const items = section.items.filter((item) =>
        `${item.keywords} ${item.label}`.toLowerCase().includes(q))
      return { ...section, items, isEmpty: items.length === 0 }
    })
  }, [query])
  const visibleCount = filtered.reduce((sum, section) => sum + section.items.length, 0)

  return (
    <aside
      id="rc2-sidebar-drawer"
      aria-label="แถบเมนูนำทางหลัก"
      className={`rc2-drawer${open ? ' is-open' : ''}`}
      aria-hidden={!open}
    >
      <div className="rc2-drawer-head">
        <span className="rc2-brand">
          <span className="rc2-brand-badge"><Icon name="lungs" size={22} filled /></span>
          <span className="rc2-brand-col">
            <span className="rc2-brand-name">RiskCARE-Health</span>
            <span className="rc2-brand-sub">เมนูนำทางระบบ</span>
          </span>
        </span>
        <button type="button" className="rc2-icon-btn" aria-label="ปิดเมนูหลัก" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="rc2-drawer-search">
        <div className="rc2-search-wrap">
          <Icon name="search" size={18} />
          <input
            type="search"
            aria-label="ค้นหาเมนู"
            placeholder="ค้นหาเมนู..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <nav className="rc2-drawer-nav">
        {filtered.map((section) => section.isEmpty && !query.trim() ? null : (
          <div className="rc2-menu-group" key={section.id}>
            <span className="rc2-menu-group-label">{section.label}</span>
            {section.items.map((item) => (
              <NavLink
                key={item.to + item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `rc2-nav-item${isActive ? ' active' : ''}`}
                onClick={onClose}
                tabIndex={open ? 0 : -1}
              >
                <Icon name={item.icon} size={19} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && <span className="rc2-nav-badge">{item.badge}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        {visibleCount === 0 && <p className="rc2-nav-empty">ไม่พบเมนูที่ตรงกับคำค้นหา</p>}
      </nav>

      <div className="rc2-drawer-footer">
        <div className="rc2-user-chip">
          <span className="rc2-avatar" aria-hidden="true">
            {(userMeta.name || 'ผ').trim().charAt(0).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="rc2-user-name">{userMeta.name || 'ผู้ใช้งาน'}</span>
            <span className="rc2-user-meta">
              RiskCARE Member{userMeta.province ? ` • ประจำ: ${userMeta.province}` : ''}
            </span>
          </span>
          <button
            type="button"
            className="rc2-logout-btn"
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            tabIndex={open ? 0 : -1}
            onClick={async () => {
              await supabase?.auth.signOut()
              window.location.assign('/login')
            }}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>
    </aside>
  )
}
