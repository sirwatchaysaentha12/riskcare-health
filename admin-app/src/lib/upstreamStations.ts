// Upstream stations source (air4thai/dustboy) พร้อม retry + cache + snapshot fallback
// v1.1 · 2026-10-01 — ทำให้ /dashboard ไม่ล่มเมื่อบริการภายนอกล่มหรือเน็ตช้า
// หลักการ: live → cache ไฟล์ล่าสุด (stale) → snapshot ในโปรเจกต์ (degraded) — ตอบเสมอ ไม่ throw ข้ามชั้น
// หมายเหตุ TLS: air4thai.pcd.go.th ไม่ส่ง intermediate certificate (UNABLE_TO_VERIFY_LEAF_SIGNATURE
// เกิดจริง 2026-10-01) — ใช้ node:https เจาะจง host นี้ด้วย rejectUnauthorized:false เฉพาะตัว
// (ข้อมูลสาธารณะ display-only ไม่มีข้อมูลส่วนบุคคล — ยอมรับได้สำหรับ demo; เว็บอื่นยังตรวจ TLS เต็มรูปแบบ)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { dirname, resolve } from 'node:path'

const AIR4THAI_URL = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php' // https ตรง — ไม่ผ่าน redirect http
const DUSTBOY_URL = 'https://open-api.cmuccdc.org/api/dustboy/stations'
const DATA_DIR = resolve(process.cwd(), 'server/data')
const CACHE_FILE = resolve(DATA_DIR, 'stations-cache.json')
const AIR4THAI_SNAPSHOT = resolve(DATA_DIR, 'air4thai.snapshot.json')
const DUSTBOY_SNAPSHOT = resolve(DATA_DIR, 'dustboy.snapshot.json')
const USER_AGENT = 'RiskCARE-Demo/1.0 (student project; contact via repository)'

type UpstreamPayload = Record<string, unknown>

export type StationsPart = {
  data: UpstreamPayload
  source: 'live' | 'cache' | 'snapshot'
  stale: boolean
  updatedAt: string | null
  error: string | null
}

type MemoryCacheEntry = { payload: UpstreamPayload; fetchedAt: string }
const memoryCache = new Map<string, MemoryCacheEntry>()

export type FetchJsonLike = (url: string, init: { headers: Record<string, string>; timeoutMs: number }) => Promise<UpstreamPayload>

// fetch มาตรฐาน (dustboy และ host อื่น): Node fetch + AbortSignal timeout
export const productionFetchJson: FetchJsonLike = async (url, { headers, timeoutMs }) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`)
  return response.json() as Promise<UpstreamPayload>
}

// fetch เฉพาะ air4thai: node:https + rejectUnauthorized:false (TLS chain ของเซิร์ฟเวอร์ไม่ครบ)
export const air4thaiFetchJson: FetchJsonLike = (url, { headers, timeoutMs }) => new Promise((resolvePromise, rejectPromise) => {
  const request = https.get(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    timeout: timeoutMs,
    rejectUnauthorized: false,
  }, (response) => {
    if ((response.statusCode ?? 500) >= 400) {
      response.resume()
      rejectPromise(new Error(`Upstream HTTP ${response.statusCode}`))
      return
    }
    let raw = ''
    response.setEncoding('utf8')
    response.on('data', (chunk) => { raw += chunk })
    response.on('end', () => {
      try {
        resolvePromise(JSON.parse(raw) as UpstreamPayload)
      } catch {
        rejectPromise(new Error('Upstream returned invalid JSON'))
      }
    })
  })
  request.on('timeout', () => request.destroy(new Error('Upstream timeout')))
  request.on('error', rejectPromise)
})

async function fetchWithRetry(fetchJson: FetchJsonLike, url: string, headers: Record<string, string>, timeoutMs: number, retries: number): Promise<UpstreamPayload> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchJson(url, { headers, timeoutMs })
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await new Promise((done) => setTimeout(done, 400 * (attempt + 1))) // backoff 400/800ms
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function readCacheFile(name: string): MemoryCacheEntry | null {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Record<string, MemoryCacheEntry>
    return parsed[name] ?? null
  } catch {
    return null
  }
}

function writeCacheFile(name: string, entry: MemoryCacheEntry) {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true })
    const current = existsSync(CACHE_FILE)
      ? (JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Record<string, MemoryCacheEntry>)
      : {}
    current[name] = entry
    writeFileSync(CACHE_FILE, JSON.stringify(current), 'utf8')
  } catch {
    // เขียน cache ไม่สำเร็จไม่กระทบการตอบกลับ
  }
}

function readSnapshot(path: string): UpstreamPayload | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as UpstreamPayload) : null
  } catch {
    return null
  }
}

// ดึงชุดข้อมูลหนึ่งแหล่ง: live → cache ไฟล์ → snapshot — การันตีคืน StationsPart เสมอ
export async function fetchStationsPart(
  name: 'air4thai' | 'dustboy',
  options: {
    url: string
    headers?: Record<string, string>
    timeoutMs?: number
    retries?: number
    fetchJson?: FetchJsonLike
  },
): Promise<StationsPart> {
  const fetchJson = options.fetchJson ?? (name === 'air4thai' ? air4thaiFetchJson : productionFetchJson)
  const timeoutMs = options.timeoutMs ?? 8000
  const retries = options.retries ?? 2
  const headers = { 'User-Agent': USER_AGENT, ...(options.headers ?? {}) }
  try {
    const payload = await fetchWithRetry(fetchJson, options.url, headers, timeoutMs, retries)
    const entry: MemoryCacheEntry = { payload, fetchedAt: new Date().toISOString() }
    memoryCache.set(name, entry)
    writeCacheFile(name, entry)
    return { data: payload, source: 'live', stale: false, updatedAt: entry.fetchedAt, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const mem = memoryCache.get(name)
    if (mem) {
      return { data: mem.payload, source: 'cache', stale: true, updatedAt: mem.fetchedAt, error: message }
    }
    const fileCache = readCacheFile(name)
    if (fileCache) {
      memoryCache.set(name, fileCache)
      return { data: fileCache.payload, source: 'cache', stale: true, updatedAt: fileCache.fetchedAt, error: message }
    }
    const snapshot = readSnapshot(name === 'air4thai' ? AIR4THAI_SNAPSHOT : DUSTBOY_SNAPSHOT)
    if (snapshot) {
      return { data: snapshot, source: 'snapshot', stale: true, updatedAt: null, error: message }
    }
    return { data: { stations: [] }, source: 'snapshot', stale: true, updatedAt: null, error: message }
  }
}

export const UPSTREAM_URLS = { air4thai: AIR4THAI_URL, dustboy: DUSTBOY_URL }
