import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { label: 'หน้าหลัก', to: '/', end: true },
  { label: 'ภาพรวม', to: '/dashboard' },
  { label: 'นัดหมาย', to: '/appointments' },
  { label: 'แนวโน้ม', to: '/air-quality-trend' },
]

export default function AppLayout() {
  return (
    <div className="app-layout">
      <header className="home-navbar app-layout-navbar">
        <nav aria-label="เมนูหลัก">
          <ul className="home-nav-links app-layout-nav-links">
            {navigation.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => isActive ? 'active-nav-link' : undefined}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="app-layout-actions">
          <NavLink
            to="/breathing-check"
            end
            aria-label="ไปหน้าประเมินการหายใจด้วยกล้อง"
            className={({ isActive }) => `app-layout-camera-link${isActive ? ' active' : ''}`}
          >
            ประเมินด้วยกล้อง
          </NavLink>
        </div>
      </header>
      <main className="app-layout-content">
        <Outlet />
      </main>
    </div>
  )
}
