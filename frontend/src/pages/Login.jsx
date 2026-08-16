import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^(?:\+?[0-9][0-9\s().-]{5,}|0[0-9\s().-]{5,})$/

function normalizePhone(value) {
  return value.trim().replace(/[\s().-]/g, '')
}

function toDummyEmail(phone) {
  return `${phone.replace(/\D/g, '')}@phone.user`
}

export default function Login() {
  const navigate = useNavigate()
  const [registering, setRegistering] = useState(false)
  const [username, setUsername] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setMessage('')
    setSuccess(false)
    if (!supabase) return setMessage('ยังไม่ได้ตั้งค่า Supabase')

    const value = identifier.trim()
    const normalizedUsername = username.trim().toLowerCase()
    const normalizedPhone = normalizePhone(value)
    const isPhoneRegistration = registering && phonePattern.test(value) && !emailPattern.test(value)
    const registrationEmail = isPhoneRegistration ? toDummyEmail(normalizedPhone) : value.toLowerCase()

    if (registering && normalizedUsername.length < 3) return setMessage('กรุณากรอกชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร')
    if (registering && !value) return setMessage('กรุณากรอกอีเมล หรือเบอร์โทรศัพท์')
    if (!registering && !value) return setMessage('กรุณากรอกอีเมล ชื่อผู้ใช้ หรือเบอร์โทร')
    if (registering && !emailPattern.test(value) && !phonePattern.test(value)) return setMessage('กรุณากรอกอีเมล หรือเบอร์โทรศัพท์ให้ถูกต้อง')
    if (password.length < 8 || password.length > 64) return setMessage('รหัสผ่านต้องมีความยาว 8–64 ตัวอักษร')

    setLoading(true)
    try {
      if (registering) {
        const duplicateField = isPhoneRegistration ? 'phone' : 'email'
        const duplicateValue = isPhoneRegistration ? normalizedPhone : registrationEmail
        const { data: existingIdentifier, error: identifierCheckError } = await supabase.rpc('is_registration_taken', {
          lookup_field: duplicateField,
          lookup_value: duplicateValue,
        })
        if (identifierCheckError) return setMessage('ไม่สามารถตรวจสอบข้อมูลสมาชิกได้ กรุณาลองใหม่อีกครั้ง')
        if (existingIdentifier === true) return setMessage(isPhoneRegistration ? 'เบอร์โทรศัพท์นี้เคยสมัครสมาชิกไปแล้ว' : 'อีเมลนี้เคยสมัครสมาชิกไปแล้ว')

        const { data: existingUsername, error: usernameCheckError } = await supabase.rpc('is_registration_taken', {
          lookup_field: 'username',
          lookup_value: normalizedUsername,
        })
        if (usernameCheckError) return setMessage('ไม่สามารถตรวจสอบชื่อผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง')
        if ((Array.isArray(existingUsername) ? existingUsername[0] : existingUsername)?.email) return setMessage('ชื่อผู้ใช้นี้มีคนใช้งานไปแล้ว')

        if (existingUsername === true) return setMessage('ชื่อผู้ใช้นี้มีคนใช้งานไปแล้ว')

        if (isPhoneRegistration) {
          const { data: existingPhone, error: phoneCheckError } = await supabase.rpc('is_registration_taken', {
            lookup_field: 'phone',
            lookup_value: normalizedPhone,
          })
          if (phoneCheckError) return setMessage('ไม่สามารถตรวจสอบเบอร์โทรศัพท์ได้ กรุณาลองใหม่อีกครั้ง')
          if ((Array.isArray(existingPhone) ? existingPhone[0] : existingPhone)?.email) return setMessage('เบอร์โทรศัพท์นี้เคยสมัครสมาชิกไปแล้ว')
        }

        const { error } = await supabase.auth.signUp({
          email: registrationEmail,
          password,
          options: { data: { username: normalizedUsername, phone: isPhoneRegistration ? normalizedPhone : null } },
        })
        if (error && /already registered|already been registered/i.test(error.message)) return setMessage('สมัครสมาชิกไปแล้ว กรุณาเข้าสู่ระบบ')
        if (error) return setMessage('สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่')

        const { error: signInError } = await supabase.auth.signInWithPassword({ email: registrationEmail, password })
        if (signInError) return setMessage('สมัครสมาชิกแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ')
        setSuccess(true)
        setMessage('สมัครสมาชิกเรียบร้อยแล้ว')
        setTimeout(() => navigate('/risk-assessment', { replace: true }), 800)
        return
      }

      const isPhone = phonePattern.test(value)
      const lookupField = emailPattern.test(value) ? 'email' : isPhone ? 'phone' : 'username'
      const lookupValue = isPhone ? normalizedPhone : value.toLowerCase()
      const { data, error: lookupError } = await supabase.rpc('get_login_email', {
        lookup_field: lookupField,
        lookup_value: lookupValue,
      })
      const profile = Array.isArray(data) ? data[0] : data
      if (lookupError) return setMessage('ไม่สามารถตรวจสอบบัญชีได้ กรุณาลองใหม่อีกครั้ง')
      if (!profile?.email) {
        return setMessage('ไม่พบชื่อผู้ใช้นี้ในระบบ กรุณาสมัครสมาชิก')
      }

      const { data: auth, error } = await supabase.auth.signInWithPassword({ email: profile.email.toLowerCase(), password })
      if (error) return setMessage('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')

      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('role, has_completed_assessment')
        .eq('id', auth.user.id)
        .maybeSingle()
      if (profileError || !userProfile?.role) return setMessage('ไม่พบสิทธิ์ผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ')
      if (userProfile.role === 'admin') return navigate('/admin/dashboard', { replace: true })
      if (userProfile.role !== 'user') return setMessage('ไม่พบสิทธิ์ผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ')
      navigate(userProfile.has_completed_assessment === true ? '/' : '/risk-assessment', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  function toggleMode() {
    setRegistering((value) => !value)
    setMessage('')
    setSuccess(false)
    setShowPassword(false)
  }

  function startRegistration() {
    setRegistering(true)
    setMessage('')
    setShowPassword(false)
  }

  return (
    <main className="auth-page">
      <section className="login-panel">
        <div className="login-card">
          <h2>{registering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h2>
          <form noValidate onSubmit={submit}>
            {registering && <label className="sr-only" htmlFor="login-username">ชื่อผู้ใช้</label>}
            {registering && <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ชื่อผู้ใช้" autoComplete="username" />}
            <label className="sr-only" htmlFor="login-identifier">อีเมล ชื่อผู้ใช้ หรือเบอร์โทรศัพท์</label>
            <input id="login-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={registering ? 'อีเมล หรือ เบอร์โทรศัพท์' : 'อีเมล ชื่อผู้ใช้ หรือเบอร์โทร'} type="text" autoComplete={registering ? 'email' : 'username'} />
            <div className="input-wrap password-input-wrap">
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="รหัสผ่าน" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} aria-label="รหัสผ่าน" />
              <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={showPassword}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={showPassword ? 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4 9.5 7-.4 1.2-1.3 2.5-2.5 3.6M6.2 6.2C4.5 7.4 3.3 9.2 2.5 12c1 3 4.5 7 9.5 7 1.2 0 2.3-.2 3.3-.6' : 'M2.5 12S6 5 12 5s9.5 7 9.5 7S18 19 12 19s-9.5-7-9.5-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <button className="primary-button" disabled={loading}>{loading ? 'กำลังดำเนินการ...' : registering ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
          </form>
          {message && <p className={`form-message ${success ? 'form-success' : 'form-error'}`} role="alert">{message}</p>}
          {!registering && <button className="register-button" type="button" onClick={startRegistration}>สมัครสมาชิก</button>}
          {registering && <button className="register-button" type="button" onClick={toggleMode}>กลับเข้าสู่ระบบ</button>}
        </div>
      </section>
    </main>
  )
}
