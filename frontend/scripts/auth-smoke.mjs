import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env.local/.env without overriding values supplied by the shell.
const envFiles = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'frontend/.env.local'),
  resolve(process.cwd(), 'frontend/.env'),
]
for (const file of envFiles) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2').trim()
  }
}

const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
try {
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  const sb = createClient(url, key)
  const email = `smoke-${Date.now()}@example.com`, password = 'TestPass123!'
  const signUp = await sb.auth.signUp({ email, password, options: { data: { username: `smoke_${Date.now()}` } } })
  if (signUp.error) throw signUp.error
  console.log('PASS signup/trigger (email confirmation may be enabled)')
  if (signUp.data.session) {
    const { data, error } = await sb.from('profiles').select('id,email,username').single()
    if (error || data.email !== email) throw error || new Error('profile sync failed')
    console.log('PASS profile read/RLS')
    await sb.auth.signOut()
  }
  process.exit(0)
} catch (error) {
  console.error(`FAIL auth smoke test: ${error?.message || error}`)
  process.exit(1)
}
