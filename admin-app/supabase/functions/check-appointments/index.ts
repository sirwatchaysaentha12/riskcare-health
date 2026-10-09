import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
type Appointment = Record<string, unknown> & { id: string; user_id: string; appointment_at: string; provider?: string | null }
type ReminderKind = 'day_before' | 'day_of'

async function sendAppointmentPush(subscription: Record<string, unknown>, appointment: Appointment, kind: ReminderKind) {
  const time = new Date(appointment.appointment_at).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  })
  const message = kind === 'day_before' ? 'พรุ่งนี้คุณมีนัดหมาย' : 'วันนี้คุณมีนัดหมาย'
  await webpush.sendNotification(subscription, JSON.stringify({
    title: 'แจ้งเตือนนัดหมายสุขภาพ',
    body: `${message}: ${appointment.provider || 'นัดหมายสุขภาพ'} เวลา ${time}`,
    tag: `appointment-${appointment.id}-${kind}`,
    url: '/appointments',
  }))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')
  if (!publicKey || !privateKey || !subject) return json({ error: 'VAPID secrets are not configured' }, 500)
  webpush.setVapidDetails(subject, publicKey, privateKey)

  const now = new Date()
  const beforeFrom = new Date(now.getTime() + 23.75 * 60 * 60_000)
  const beforeTo = new Date(now.getTime() + 24.25 * 60 * 60_000)
  const todayFrom = new Date(now.getTime() - 15 * 60_000)
  const todayTo = new Date(now.getTime() + 15 * 60_000)
  const [beforeQuery, todayQuery] = await Promise.all([
    supabase.from('health_appointments').select('*').eq('status', 'scheduled')
      .gte('appointment_at', beforeFrom.toISOString()).lte('appointment_at', beforeTo.toISOString())
      .is('reminder_day_before_sent_at', null),
    supabase.from('health_appointments').select('*').eq('status', 'scheduled')
      .gte('appointment_at', todayFrom.toISOString()).lte('appointment_at', todayTo.toISOString())
      .is('reminder_day_of_sent_at', null),
  ])
  if (beforeQuery.error || todayQuery.error) {
    const message = beforeQuery.error?.message || todayQuery.error?.message
    console.error('Unable to find appointments to remind:', message)
    return json({ error: message }, 500)
  }

  const jobs: Array<{ appointment: Appointment; kind: ReminderKind }> = [
    ...(beforeQuery.data ?? []).map((appointment) => ({ appointment: appointment as Appointment, kind: 'day_before' as const })),
    ...(todayQuery.data ?? []).map((appointment) => ({ appointment: appointment as Appointment, kind: 'day_of' as const })),
  ]
  const results = []

  for (const { appointment, kind } of jobs) {
    try {
      const { data: subscriptions, error: subscriptionError } = await supabase
        .from('push_subscriptions').select('subscription').eq('user_id', appointment.user_id)
      if (subscriptionError) throw subscriptionError
      if (!subscriptions?.length) {
        results.push({ id: appointment.id, kind, sent: false, reason: 'No push subscription registered' })
        continue
      }
      const outcomes = await Promise.allSettled(subscriptions.map(({ subscription }) =>
        sendAppointmentPush(subscription as Record<string, unknown>, appointment, kind)))
      const failures = outcomes.filter((outcome) => outcome.status === 'rejected')
      if (failures.length === outcomes.length) throw new Error(String(failures[0]?.reason ?? 'Push delivery failed'))

      const sentField = kind === 'day_before' ? 'reminder_day_before_sent_at' : 'reminder_day_of_sent_at'
      const sentAt = new Date().toISOString()
      const appointmentUpdate = kind === 'day_of'
        ? { [sentField]: sentAt, status: 'completed', completed_at: sentAt }
        : { [sentField]: sentAt }
      const { error: updateError } = await supabase.from('health_appointments')
        .update(appointmentUpdate).eq('id', appointment.id)
      if (updateError) throw updateError
      results.push({ id: appointment.id, kind, sent: true, failedSubscriptions: failures.length })
    } catch (error) {
      console.error(`Reminder ${kind} failed for appointment ${appointment.id}:`, error)
      results.push({ id: appointment.id, kind, sent: false, error: String(error) })
    }
  }

  return json({ checked: jobs.length, results })
})
