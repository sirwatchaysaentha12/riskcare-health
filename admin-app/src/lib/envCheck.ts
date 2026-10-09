/**
 * envCheck.ts — ตรวจสอบ env variables ตอนเริ่มต้น (ไม่พิมพ์ค่า)
 *
 * กฎ:
 * - ไม่พิมพ์ค่าจริงของ env variable ในทุกกรณี
 * - แค่รายงานว่า "present" / "missing" / "empty"
 * - ไม่ throw — คืน object ให้ caller ตัดสินใจ
 */

export type EnvCheckResult = {
  supabaseUrl: 'present' | 'missing'
  supabaseAnonKey: 'present' | 'missing'
  supabaseServiceRoleKey: 'present' | 'missing'
  openaqApiKey: 'present' | 'missing' | 'short'
  allRequired: boolean
  openaqAvailable: boolean
}

export function checkEnv(): EnvCheckResult {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  const openaqKey = (process.env.OPENAQ_API_KEY ?? '').trim()

  const result: EnvCheckResult = {
    supabaseUrl: supabaseUrl ? 'present' : 'missing',
    supabaseAnonKey: anonKey ? 'present' : 'missing',
    supabaseServiceRoleKey: serviceKey ? 'present' : 'missing',
    openaqApiKey: !openaqKey ? 'missing' : openaqKey.length < 8 ? 'short' : 'present',
    allRequired: Boolean(supabaseUrl && serviceKey),
    openaqAvailable: openaqKey.length >= 8,
  }

  // รายงาน (ไม่พิมพ์ค่า)
  console.info('[env] supabase_url:', result.supabaseUrl)
  console.info('[env] supabase_service_role_key:', result.supabaseServiceRoleKey)
  console.info('[env] openaq_api_key:', result.openaqApiKey)

  if (!result.allRequired) {
    console.warn('[env] ⚠️ ตัวแปร Supabase จำเป็นไม่ครบ — บางฟีเจอร์จะไม่ทำงาน')
  }
  if (!result.openaqAvailable) {
    console.info('[env] OpenAQ key ไม่มีหรือสั้นเกินไป — ใช้ PCD เป็น primary provider')
  }

  return result
}

/** ตรวจ env ครั้งเดียวตอน import (Next.js server-side) */
let checked = false
export function ensureEnvChecked() {
  if (!checked) {
    checked = true
    checkEnv()
  }
}
