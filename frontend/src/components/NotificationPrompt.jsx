import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DISMISSED_KEY = 'appointment_notification_prompt_dismissed'

function applicationServerKey(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const decoded = window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
      if (supported && Notification.permission === 'default' && !localStorage.getItem(DISMISSED_KEY)) setVisible(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  async function allow() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setMessage('เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        localStorage.setItem(DISMISSED_KEY, '1')
        setVisible(false)
        return
      }
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('ยังไม่ได้ตั้งค่า VITE_VAPID_PUBLIC_KEY')
      if (!supabase) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล')
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนเปิดการแจ้งเตือน')
      const registration = await navigator.serviceWorker.register('/push-sw.js')
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(vapidKey) })
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (error) throw error
      localStorage.setItem(DISMISSED_KEY, '1')
      setVisible(false)
    } catch (error) {
      setMessage(error?.message || 'เปิดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่')
    }
  }
  function deny() { localStorage.setItem(DISMISSED_KEY, '1'); setVisible(false) }
  if (!visible) return null
  return <div className="notification-prompt" role="dialog" aria-label="ขออนุญาตแจ้งเตือนนัดหมาย" aria-describedby="appointment-notification-description">
    <strong>อนุญาตให้ระบบแจ้งเตือนนัดหมายไหม?</strong>
    <p id="appointment-notification-description">รับการเตือนก่อนวันนัด 1 วันและในวันนัด แม้ไม่ได้เปิดเว็บ</p>
    {message && <p role="alert">{message}</p>}
    <div><button type="button" onClick={allow}>เปิดการแจ้งเตือน</button><button type="button" onClick={deny}>ไว้ภายหลัง</button></div>
  </div>
}
