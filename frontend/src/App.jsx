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
import AdminRoute from './components/AdminRoute'
import AdminDashboard from './pages/AdminDashboard'
import RegionalDashboard from './pages/RegionalDashboard'
import Profile from './pages/Profile'
import History from './pages/History'
import HealthPlanning from './pages/HealthPlanning'
import ExerciseHub from './pages/ExerciseHub'
import HealthTracker from './pages/HealthTracker'
import ExerciseDetail from './pages/ExerciseDetail'
import AppointmentCalendar from './pages/AppointmentCalendar'
import AirQualityTrend from './pages/AirQualityTrend'
import BreathingRateCheck from './pages/BreathingRateCheck'
import HourlyForecast from './pages/HourlyForecast'
import ProvinceForecast from './pages/ProvinceForecast'
import './styles/breathing.css'
import RespiratoryRiskAssessment from './pages/RespiratoryRiskAssessment'
import RespiratoryCheckHub from './pages/RespiratoryCheckHub'
import './styles/respiratory-risk.css'
import AppLayout from './components/AppLayout'
import { AssessmentGuard, OnboardingGuard } from './components/AssessmentAccessGuard'
import './styles/profile.css'
import './styles/health-planning.css'
import './styles/exercise-hub.css'
import './styles/home-v2.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AssessmentGuard><AppLayout /></AssessmentGuard>}>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<RegionalDashboard />} />
          <Route path="/appointments" element={<AppointmentCalendar />} />
          <Route path="/air-quality-trend" element={<AirQualityTrend />} />
          <Route path="/hourly-forecast" element={<HourlyForecast />} />
          <Route path="/pm25-forecast" element={<ProvinceForecast />} />
          <Route path="/respiratory-check" element={<RespiratoryCheckHub />} />
          <Route path="/breathing-check" element={<BreathingRateCheck />} />
          <Route path="/assessment" element={<Assessment />} />
          <Route path="/risk-assessment" element={<Assessment />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/respiratory-risk" element={<RespiratoryRiskAssessment />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/history" element={<History />} />
          <Route path="/health-planning" element={<HealthPlanning />} />
          <Route path="/exercise-plan" element={<ExerciseHub />} />
          <Route path="/health-tracker" element={<HealthTracker />} />
          <Route path="/add-appointment" element={<Navigate to="/appointments" replace />} />
          <Route path="/workout-plan" element={<Navigate to="/exercise-plan" replace />} />
          <Route path="/exercise-detail" element={<ExerciseDetail />} />
        </Route>
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/onboarding/assessment" element={<OnboardingGuard><Assessment mode="onboarding" /></OnboardingGuard>} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
