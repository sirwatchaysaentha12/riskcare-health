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
import './styles/sidebar.css'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import AdminDashboard from './pages/AdminDashboard'
import RegionalDashboard from './pages/RegionalDashboard'
import Profile from './pages/Profile'
import History from './pages/History'
import HealthPlanning from './pages/HealthPlanning'
import ExercisePlan from './pages/ExercisePlan'
import HealthTracker from './pages/HealthTracker'
import WorkoutPlan from './pages/WorkoutPlan'
import ExerciseDetail from './pages/ExerciseDetail'
import AppointmentCalendar from './pages/AppointmentCalendar'
import AddAppointment from './pages/AddAppointment'
import AirQualityTrend from './pages/AirQualityTrend'
import BreathingRateCheck from './pages/BreathingRateCheck'
import HourlyForecast from './pages/HourlyForecast'
import './styles/breathing.css'
import RespiratoryRiskAssessment from './pages/RespiratoryRiskAssessment'
import './styles/respiratory-risk.css'
import AppLayout from './components/AppLayout'
import './styles/profile.css'
import './styles/health-planning.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<RegionalDashboard />} />
          <Route path="/appointments" element={<AppointmentCalendar />} />
          <Route path="/air-quality-trend" element={<AirQualityTrend />} />
          <Route path="/hourly-forecast" element={<HourlyForecast />} />
          <Route path="/breathing-check" element={<BreathingRateCheck />} />
          <Route path="/assessment" element={<Assessment />} />
          <Route path="/risk-assessment" element={<Assessment />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/respiratory-risk" element={<RespiratoryRiskAssessment />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/history" element={<History />} />
          <Route path="/health-planning" element={<HealthPlanning />} />
          <Route path="/exercise-plan" element={<ExercisePlan />} />
          <Route path="/health-tracker" element={<HealthTracker />} />
          <Route path="/add-appointment" element={<AddAppointment />} />
          <Route path="/workout-plan" element={<WorkoutPlan />} />
          <Route path="/exercise-detail" element={<ExerciseDetail />} />
        </Route>
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

