import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders })

function isEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) }

async function sendEmail(to: string, appointment: Record<string, unknown>) {
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: [to], subject: 'แจ้งเตือนนัดหมายสุขภาพ', html: `<p>คุณมีนัดหมายใกล้ถึง</p><p><strong>${appointment.provider || 'นัดหมายสุขภาพ'}</strong></p><p>วันเวลา: ${new Date(String(appointment.appointment_at)).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p><p>${appointment.notes || ''}</p>` }) })
  if (!response.ok) throw new Error(`Resend error: ${await response.text()}`)
}

// Optional LINE Messaging API support. Set LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID.
async function sendLine(appointment: Record<string, unknown>) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN'); const userId = Deno.env.get('LINE_USER_ID'); if (!token || !userId) return false
  const response = await fetch('https://api.line.me/v2/bot/message/push', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: `แจ้งเตือนนัดหมาย: ${appointment.provider || 'นัดหมายสุขภาพ'} เวลา ${new Date(String(appointment.appointment_at)).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}` }] }) })
  return response.ok
}

async function sendPush(subscription: Record<string, unknown>, appointment: Record<string, unknown>) {
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  await webpush.sendNotification(subscription, JSON.stringify({ title: 'แจ้งเตือนนัดหมาย', body: `${appointment.provider || 'นัดหมายสุขภาพ'} เวลา ${new Date(String(appointment.appointment_at)).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}` }))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'Unauthorized' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = new Date(); const horizon = new Date(now.getTime() + Number(Deno.env.get('REMINDER_WINDOW_MINUTES') || 60) * 60_000)
  const { data: appointments, error } = await supabase.from('health_appointments').select('*').gte('appointment_at', now.toISOString()).lte('appointment_at', horizon.toISOString()).is('reminder_sent_at', null)
  if (error) return json({ error: error.message }, 500)
  const results = []
  for (const appointment of appointments || []) { try { const { data: subscriptions } = await supabase.from('push_subscriptions').select('subscription').eq('user_id', appointment.user_id); for (const row of subscriptions || []) await sendPush(row.subscription, appointment); await supabase.from('health_appointments').update({ reminder_sent_at: new Date().toISOString(), notified_at: new Date().toISOString() }).eq('id', appointment.id); results.push({ id: appointment.id, sent: true }) } catch (sendError) { results.push({ id: appointment.id, sent: false, error: String(sendError) }) } }
  return json({ checked: appointments?.length || 0, results })
})
