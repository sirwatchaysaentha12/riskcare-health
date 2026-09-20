import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const timer = window.setTimeout(() => { if ('Notification' in window && Notification.permission === 'default' && !sessionStorage.getItem('notification_prompt_dismissed')) setVisible(true) }, 0); return () => window.clearTimeout(timer) }, [])
  async function allow() { sessionStorage.setItem('notification_prompt_dismissed', '1'); setVisible(false); if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return; try { const permission = await Notification.requestPermission(); if (permission !== 'granted') return; const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY; if (!vapidKey) throw new Error('ยังไม่ได้ตั้งค่า VITE_VAPID_PUBLIC_KEY'); const registration = await navigator.serviceWorker.register('/push-sw.js'); const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey }); const { data: { user } } = await supabase.auth.getUser(); if (user) { const { error } = await supabase.from('push_subscriptions').upsert({ user_id: user.id, endpoint: subscription.endpoint, subscription: subscription.toJSON(), updated_at: new Date().toISOString() }, { onConflict: 'endpoint' }); if (error) throw error } } catch (error) { window.alert(error.message || 'ไม่สามารถเปิดการแจ้งเตือนได้') } }
  function deny() { sessionStorage.setItem('notification_prompt_dismissed', '1'); setVisible(false) }
  if (!visible) return null
  return <div className="notification-prompt" role="dialog" aria-label="ขออนุญาตแจ้งเตือน"><strong>อนุญาตให้ระบบแจ้งเตือนนัดหมายไหม?</strong><p>เราจะแจ้งเตือนคุณก่อนถึงเวลานัดหมาย</p><div><button type="button" onClick={allow}>เปิดการแจ้งเตือน</button><button type="button" onClick={deny}>ไว้ภายหลัง</button></div></div>
}
