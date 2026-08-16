import dotenv from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Missing Supabase URL or service role key')

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function readAll(table) {
  const { data, error } = await admin.from(table).select('*')
  if (error) throw new Error(`${table}: ${error.message}`)
  return data ?? []
}

const profiles = await readAll('profiles')
const riskAssessments = await readAll('risk_assessments')
const users = []
let page = 1
while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw new Error(`auth.users: ${error.message}`)
  users.push(...(data.users ?? []))
  if (!data.users || data.users.length < 1000) break
  page += 1
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const output = `../backups/supabase-backup-${stamp}.json`
await mkdir('../backups', { recursive: true })
await writeFile(output, JSON.stringify({
  generated_at: new Date().toISOString(),
  source: url,
  note: 'Data backup; auth user records exclude passwords and tokens.',
  profiles,
  risk_assessments: riskAssessments,
  auth_users: users,
}, null, 2), 'utf8')

console.log(JSON.stringify({ output, profiles: profiles.length, risk_assessments: riskAssessments.length, auth_users: users.length }))
