import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import AppHeaderV2 from './AppHeaderV2'
import SidebarDrawer from './SidebarDrawer'
import AssessmentGate from './AssessmentGate'
import NotificationPrompt from './NotificationPrompt'
import '../styles/appshell-v2.css'

// Shell v2: fixed header + hamburger slide-out drawer (แทน persistent sidebar เดิม)
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <div className="rc2-root">
      <div
        className={`rc2-backdrop${drawerOpen ? ' is-open' : ''}`}
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
      />
      <SidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="rc2-frame">
        <AppHeaderV2 onMenuClick={() => setDrawerOpen(true)} />
        <main className="rc2-main">
          <AssessmentGate />
          <Outlet />
        </main>
        <NotificationPrompt />
      </div>
    </div>
  )
}
