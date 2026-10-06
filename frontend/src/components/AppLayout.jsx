import { Outlet } from 'react-router-dom'
import SidebarNav from './SidebarNav'

export default function AppLayout() {
  return (
    <div className="app-shell">
      <SidebarNav />
      <div className="app-shell-content">
        <main className="app-layout-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
