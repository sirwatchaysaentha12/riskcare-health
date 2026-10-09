// Pure province-forecast selection — กันหน้าว่างตามสเปก:
// ทุกกรณีต้องได้สถานะใดสถานะหนึ่ง: ok / stale(ข้อมูลเก่า บอกอายุ) / unsupported(จังหวัดยังไม่รองรับ) / no_data / error
// กฎ stale fallback: ถ้ารอบวันนี้ล้มเหลว ใช้ผลจากรอบล่าสุดที่ยังใช้ได้สำหรับวันนั้น
// (เช่น +2 ของเมื่อวาน = +1 ของวันนี้) พร้อม issued_date ให้หน้าเว็บติดป้าย "ออกเมื่อ"

export type ProvinceForecastRow = {
  province: string
  target_date: string
  issued_date: string
  horizon: number
  pm25: number
  model_version?: string | null
}

export type ProvinceForecastItem = {
  horizon: number
  targetDate: string
  pm25: number
  issuedDate: string
  ageDays: number
  modelVersion?: string | null
}

export type ProvinceForecastSelection = {
  state: 'ok' | 'stale' | 'unsupported' | 'no_data'
  province: string
  items: ProvinceForecastItem[]
  latestIssue: string | null
  message: string
  modelVersion?: string | null
}

export function bangkokToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}

function ageDays(today: string, issued: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${issued}T00:00:00Z`)) / 86400000)
}

export function isProvinceSupported(province: string, supportedProvinces: string[]): boolean {
  return supportedProvinces.includes(province)
}

export function selectProvinceForecast(
  rows: ProvinceForecastRow[],
  opts: { province: string; today?: string; supportedProvinces: string[] },
): ProvinceForecastSelection {
  const { province, supportedProvinces } = opts
  const today = opts.today ?? bangkokToday()
  const empty: ProvinceForecastSelection = { state: 'no_data', province, items: [], latestIssue: null, message: '', modelVersion: null }

  if (!province || !isProvinceSupported(province, supportedProvinces)) {
    return {
      ...empty,
      state: 'unsupported',
      message: 'จังหวัดนี้ยังไม่รองรับการพยากรณ์ — โมเดลเทรนบนสถานีในกรุงเทพมหานครเท่านั้น ระบบจึงไม่ยืมค่าจังหวัดอื่นมาแสดง',
    }
  }

  // เลือกแถว issued ล่าสุดของแต่ละ (target_date, horizon)
  const best = new Map<string, ProvinceForecastRow>()
  for (const row of rows) {
    if (row.province !== province) continue
    const key = `${row.target_date}|${row.horizon}`
    const cur = best.get(key)
    if (!cur || row.issued_date > cur.issued_date) best.set(key, row)
  }

  // วันเป้าหมายที่ต้องมี: พรุ่งนี้ถึง +3 — เลือก "แถว issued ใหม่สุดที่ target_date ตรง" ข้าม horizon ได้
  // (สเปก stale fallback: +2 ของเมื่อวาน = +1 ของวันนี้ — สิ่งที่สำคัญคือวันเป้าหมาย ไม่ใช่หมายเลข horizon ตอนออก)
  const items: ProvinceForecastItem[] = []
  let anyFromToday = false
  let latestIssue: string | null = null
  for (let h = 1; h <= 3; h += 1) {
    const wanted = addDays(today, h)
    let row: ProvinceForecastRow | undefined
    for (const cand of best.values()) {
      if (cand.target_date !== wanted) continue
      if (!row || cand.issued_date > row.issued_date) row = cand
    }
    if (!row) continue
    const age = ageDays(today, row.issued_date)
    if (row.issued_date === today) anyFromToday = true
    if (!latestIssue || row.issued_date > latestIssue) latestIssue = row.issued_date
    items.push({ horizon: h, targetDate: row.target_date, pm25: Number(row.pm25), issuedDate: row.issued_date, ageDays: age, modelVersion: row.model_version ?? null })
  }

  if (!items.length) return { ...empty, message: 'ยังไม่มีผลพยากรณ์สำหรับจังหวัดนี้ — รอ pipeline รอบถัดไป' }

  const complete = items.length === 3
  if (complete && anyFromToday) {
    return { state: 'ok', province, items, latestIssue, message: 'ผลรอบล่าสุด', modelVersion: items[0]?.modelVersion ?? null }
  }
  return {
    state: 'stale',
    province,
    items,
    latestIssue,
    modelVersion: items[0]?.modelVersion ?? null,
    message: complete
      ? `ข้อมูลเก่า — ผลล่าสุดออกเมื่อ ${latestIssue} (รอบวันนี้ยังไม่พร้อม)`
      : `ข้อมูลเก่าและไม่ครบ — ผลล่าสุดออกเมื่อ ${latestIssue}`,
  }
}
