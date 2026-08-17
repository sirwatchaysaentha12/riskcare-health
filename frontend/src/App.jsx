import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Assessment from './pages/Assessment'
import Home from './pages/Home'
import Overview from './pages/Overview'
import Login from './pages/Login'
import './styles/assessment.css'
import './styles/auth.css'
import './styles/dashboard.css'
import './styles/home.css'
import './styles/modal.css'
import './styles/overview.css'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import AdminDashboard from './pages/AdminDashboard'
import RegionalDashboard from './pages/RegionalDashboard'
import Profile from './pages/Profile'
import History from './pages/History'
import HealthPlanning from './pages/HealthPlanning'
import './styles/profile.css'
import './styles/health-planning.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><RegionalDashboard /></ProtectedRoute>} />
        <Route path="/assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
        <Route path="/risk-assessment" element={<ProtectedRoute><Assessment /></ProtectedRoute>} />
        <Route path="/overview" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/health-planning" element={<ProtectedRoute><HealthPlanning /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
