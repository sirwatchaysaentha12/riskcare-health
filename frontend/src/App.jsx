import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Assessment from './pages/Assessment'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import './styles/assessment.css'
import './styles/auth.css'
import './styles/dashboard.css'
import './styles/modal.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/assessment" element={<Assessment />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
