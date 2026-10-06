import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import LogoIcon from './LogoIcon'
import { supabase } from '../lib/supabase'

/* ─── Sidebar Navigation — RiskCARE Health ───
 * Dark slate + mint accent (เข้าธีม Mint/Slate ของเว็บ)
 * Sections: เมนูหลัก · สุขภาพทางเดินหายใจ · นัดหมาย · แผนสุขภาพ · บัญชีของฉัน
 * มี search filter + collapsible sections + active highlight
 */

const SECTIONS = [
  {
    id: 'main',
    label: 'เมนูหลัก',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
    items: [
      { to: '/', label: 'หน้าหลัก', end: true, icon: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/dashboard', label: 'ภาพรวมฝุ่น PM2.5', icon: <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/air-quality-trend', label: 'แนวโน้มฝุ่นรายวัน', icon: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/hourly-forecast', label: 'ฝุ่นรายชั่วโมง', icon: <path d="M12 8v4l3 3M12 3a9 9 0 1 0 .01 0Z" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
    ],
  },
  {
    id: 'respiratory',
    label: 'สุขภาพทางเดินหายใจ',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5c-1.5-2-5-2.5-6.5 0S4 11 6 13s5 3.5 6 6c1-2.5 4-4 6-6s2-5.5.5-8S13.5 3 12 5Z" />
      </svg>
    ),
    items: [
      { to: '/respiratory-risk', label: 'ประเมินความเสี่ยงโรคทางเดินหายใจ', icon: <path d="M12 5c-1.5-2-5-2.5-6.5 0S4 11 6 13s5 3.5 6 6c1-2.5 4-4 6-6s2-5.5.5-8S13.5 3 12 5Z" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/breathing-check', label: 'ตรวจการหายใจด้วยกล้อง', icon: <rect x="3" y="5" width="18" height="14" rx="2" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/assessment', label: 'แบบประเมินสุขภาพ 14 ข้อ', icon: <path d="M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
    ],
  },
  {
    id: 'appointments',
    label: 'นัดหมาย',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
    ),
    items: [
      { to: '/appointments', label: 'ปฏิทินนัดหมาย', icon: <rect x="3" y="5" width="18" height="16" rx="2" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/add-appointment', label: 'เพิ่มนัดหมาย', icon: <path d="M12 5v14M5 12h14" strokeLinecap="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
    ],
  },
  {
    id: 'health-plan',
    label: 'แผนสุขภาพ',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.4 5.5 5.5 0 0 0-9.8 3.4c0 6 9.8 11.4 9.8 11.4s9.8-5.4 9.8-11.4Z" transform="translate(1 1) scale(0.92)" />
      </svg>
    ),
    items: [
      { to: '/health-planning', label: 'แผนสุขภาพส่วนตัว', icon: <path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.4 5.5 5.5 0 0 0-9.8 3.4c0 6 9.8 11.4 9.8 11.4s9.8-5.4 9.8-11.4Z" transform="translate(1 1) scale(0.92)" /> },
      { to: '/exercise-plan', label: 'โปรแกรมออกกำลังกาย', icon: <path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12" strokeLinecap="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/health-tracker', label: 'บันทึกสุขภาพ', icon: <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/workout-plan', label: 'แผนออกกำลังกายรายวัน', icon: <path d="M12 3a9 9 0 1 0 .01 0ZM12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
    ],
  },
  {
    id: 'account',
    label: 'บัญชีของฉัน',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
      </svg>
    ),
    items: [
      { to: '/profile', label: 'โปรไฟล์ของฉัน', icon: <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" /> },
      { to: '/history', label: 'ประวัติการใช้งาน', icon: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor" strokeWidth="2" /> },
    ],
  },
]

const ALL_ITEMS = SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, sectionLabel: section.label, sectionId: section.id })),
)

function getInitials(username) {
  if (!username) return 'ผู้ใช้'
  return username.trim().charAt(0).toUpperCase() || 'ผ'
}

export default function SidebarNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    const current = SECTIONS.find((section) =>
      section.items.some((item) => item.to === location.pathname))
    return { [current?.id ?? 'main']: true }
  })
  const [username, setUsername] = useState('')

  useEffect(() => {
    setMobileOpen(false)
    setQuery('')
    const current = SECTIONS.find((section) => section.items.some((item) => item.to === location.pathname))
    if (current) setCollapsed((state) => ({ ...state, [current.id]: true }))
  }, [location.pathname])

  useEffect(() => {
    let cancelled = false
    supabase?.auth.getUser().then(({ data }) => {
      if (!cancelled) setUsername(data?.user?.user_metadata?.username || '')
    })
    return () => { cancelled = true }
  }, [])

  async function handleLogout() {
    await supabase?.auth.signOut()
    navigate('/login', { replace: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SECTIONS.map((section) => ({ ...section, visibleItems: section.items, isEmpty: false }))
    return SECTIONS.map((section) => ({
      ...section,
      visibleItems: section.items.filter((item) => item.label.toLowerCase().includes(q)),
      isEmpty: section.items.filter((item) => item.label.toLowerCase().includes(q)).length === 0,
    }))
  }, [query])

  function toggleSection(id) {
    setCollapsed((state) => ({ ...state, [id]: !state[id] }))
  }

  return (
    <>
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={mobileOpen ? 'ปิดเมนูด้านข้าง' : 'เปิดเมนูด้านข้าง'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </button>

      <button
        className={`sidebar-backdrop${mobileOpen ? ' is-visible' : ''}`}
        type="button"
        aria-label="ปิดเมนู"
        onClick={() => setMobileOpen(false)}
        tabIndex={mobileOpen ? 0 : -1}
      />

      <aside className={`app-sidebar${mobileOpen ? ' app-sidebar--mobile-open' : ' app-sidebar--mobile-hidden'}`} aria-label="เมนูนำทางด้านข้าง">
        <div className="app-sidebar-brand">
          <LogoIcon />
          <span className="app-sidebar-brand-name">
            <b>RiskCARE-Health</b>
            <span>ฝุ่น PM2.5 &amp; สุขภาพทางเดินหายใจ</span>
          </span>
        </div>

        <div className="app-sidebar-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาเมนู…"
            aria-label="ค้นหาเมนู"
          />
        </div>

        <nav className="app-sidebar-menu" aria-label="เมนูหลักด้านข้าง">
          {filtered.map((section) => {
            const isCurrent = section.items.some((item) => item.to === location.pathname)
            const expanded = query.trim() ? true : Boolean(collapsed[section.id]) || isCurrent
            return (
              <div className="sidebar-section" key={section.id}>
                <button
                  className="sidebar-section-head"
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={expanded}
                >
                  {section.icon}
                  <span>{section.label}</span>
                  <svg className="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div className={`sidebar-items${expanded ? '' : ' sidebar-items--hidden'}`}>
                  {section.isEmpty && <p className="sidebar-empty">ไม่พบเมนูที่ค้นหา</p>}
                  {section.visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <svg className="item-icon" viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="app-sidebar-footer">
          <div className="sidebar-user-chip">
            <span className="sidebar-avatar" aria-hidden="true">{getInitials(username)}</span>
            <span className="sidebar-user-name">
              <b>{username || 'ผู้ใช้งาน'}</b>
              <span>RiskCARE member</span>
            </span>
          </div>
          <button className="sidebar-logout" type="button" onClick={handleLogout} aria-label="ออกจากระบบ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  )
}
