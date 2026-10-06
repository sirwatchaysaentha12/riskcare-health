import { Outlet } from 'react-router-dom'
import SidebarNav from './SidebarNav'
import AssessmentGate from './AssessmentGate'

export default function AppLayout() {
  return (
    <div className="app-shell">
      <SidebarNav />
      <div className="app-shell-content">
        <AssessmentGate />
        <div className="app-layout-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
