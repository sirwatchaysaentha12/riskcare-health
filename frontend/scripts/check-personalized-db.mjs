import { createClient } from '@supabase/supabase-js'
import { getPersonalizedAudience } from '../src/utils/personalizedPm25.js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  throw new Error('ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ก่อนรันสคริปต์นี้')
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const users = [
  '59f8a24c-a3ba-48a5-b7f1-88d8a5f68381',
  'c453b639-1e28-43fd-a025-92519e65476f',
]

for (const userId of users) {
  const [{ data: healthProfile, error: healthError }, { data: profile, error: profileError }, { data: assessment, error: assessmentError }] = await Promise.all([
    supabase.from('health_profiles').select('chronic_condition, medication').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('health_risk_group, has_completed_assessment').eq('id', userId).maybeSingle(),
    supabase.from('risk_assessments').select('answers').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (healthError) throw healthError
  if (profileError) throw profileError
  if (assessmentError) throw assessmentError

  const result = getPersonalizedAudience(profile, assessment, healthProfile)
  console.log(JSON.stringify({ userId, healthProfile, audience: result.audience, reason: result.reason }, null, 2))
}
