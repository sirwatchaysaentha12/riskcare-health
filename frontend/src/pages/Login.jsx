import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthFieldIcon from '../components/auth/AuthFieldIcon'

const riskLevels = [
  { label: 'ความเสี่ยงสูงมาก', color: 'risk-red', icon: '!' },
  { label: 'ความเสี่ยงสูง', color: 'risk-orange', icon: '↑' },
  { label: 'ความเสี่ยงปานกลาง', color: 'risk-yellow', icon: '~' },
  { label: 'ความเสี่ยงต่ำ', color: 'risk-green', icon: '✓' },
]

function Login() {
  const navigate = useNavigate()
  const [isRegistering, setIsRegistering] = useState(false)
  const [credentials, setCredentials] = useState({ identifier: '', password: '' })
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setCredentials((current) => ({ ...current, [name]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    setMessage(isRegistering ? 'กำลังสร้างบัญชีตัวอย่าง...' : 'กำลังเข้าสู่ระบบตัวอย่าง...')
    setTimeout(() => navigate('/dashboard'), 400)
  }

  function handleGoogleLogin() {
    setMessage('กำลังเข้าสู่ระบบด้วย Google ตัวอย่าง...')
    setTimeout(() => navigate('/dashboard'), 400)
  }

  function toggleRegister() {
    setIsRegistering((current) => !current)
    setMessage('')
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <div className="welcome-topline">
            <div className="brand-lockup">
              <span className="brand-symbol" aria-hidden="true">✦</span>
              <div className="brand-mark">RISK<span>CARE</span></div>
            </div>
            <span className="secure-badge"><span /> ปลอดภัยและเป็นส่วนตัว</span>
          </div>
          <div className="welcome-copy">
            <p className="eyebrow">ระบบประเมินสุขภาพเบื้องต้น</p>
            <h1 id="welcome-title">ประเมินความเสี่ยงต่อการเป็นโรคทางเดินหายใจ</h1>
            <p className="welcome-description">
              ดูแลสุขภาพของคุณด้วยข้อมูลที่เข้าใจง่ายและระบบที่ออกแบบมาเพื่อความปลอดภัยของคุณ
            </p>
          </div>
          <div className="risk-list" aria-label="ระดับความเสี่ยง">
            {riskLevels.map((level) => (
              <div className="risk-card" key={level.label}>
                <span className={`risk-icon ${level.color}`}>{level.icon}</span>
                <span className="risk-card-copy"><strong>{level.label}</strong><small>ดูรายละเอียดระดับความเสี่ยง</small></span>
              </div>
            ))}
          </div>
          <p className="welcome-footnote">ข้อมูลที่ช่วยให้คุณเข้าใจสุขภาพของตัวเองได้ดีขึ้น</p>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-card">
            <div className="mobile-brand"><span className="brand-symbol" aria-hidden="true">✦</span> RISK<span>CARE</span></div>
            <p className="eyebrow login-eyebrow">{isRegistering ? 'เริ่มต้นดูแลสุขภาพ' : 'ยินดีต้อนรับกลับมา'}</p>
            <h2 id="login-title">{isRegistering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
            <p className="login-subtitle">
              {isRegistering ? 'สร้างบัญชีเพื่อบันทึกผลการประเมินของคุณ' : 'กรอกข้อมูลเพื่อเข้าสู่พื้นที่สุขภาพของคุณ'}
            </p>

            <form onSubmit={handleSubmit}>
              <label htmlFor="identifier">{isRegistering ? 'อีเมล' : 'อีเมลหรือชื่อผู้ใช้'}</label>
              <div className="input-wrap">
                <AuthFieldIcon type="user" />
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  value={credentials.identifier}
                  onChange={handleChange}
                  placeholder={isRegistering ? 'เช่น name@example.com' : 'เช่น name@example.com'}
                  required
                />
              </div>

              <div className="password-label">
                <label htmlFor="password">รหัสผ่าน</label>
                {!isRegistering && <a href="#forgot-password">ลืมรหัสผ่าน?</a>}
              </div>
              <div className="input-wrap">
                <AuthFieldIcon type="password" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={credentials.password}
                  onChange={handleChange}
                  placeholder="กรอกรหัสผ่านของคุณ"
                  required
                />
                <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                  {showPassword ? 'ซ่อน' : 'แสดง'}
                </button>
              </div>

              <button className="primary-button" type="submit">
                {isRegistering ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            {!isRegistering && (
              <>
                <div className="divider"><span>หรือ</span></div>
                <button className="google-button" type="button" onClick={handleGoogleLogin}>
                  <span className="google-icon">G</span>
                  เข้าสู่ระบบด้วย Google
                </button>
              </>
            )}
            {message && <p className="form-message" role="status">{message}</p>}
            <p className="register-switch">
              {isRegistering ? 'มีบัญชีอยู่แล้ว?' : 'ยังไม่มีบัญชี?'}{' '}
              <button type="button" onClick={toggleRegister}>
                {isRegistering ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
              </button>
            </p>
            <p className="demo-note">โหมดสาธิต: ระบบยังไม่ได้เชื่อมต่อฐานข้อมูลจริง</p>
          </div>
        </section>
      </div>
    </main>
  )
}

export default Login