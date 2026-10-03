// ระบบแจ้งเตือนค่าฝุ่นตามจังหวัด **ที่ผู้ใช้กรอกในโปรไฟล์** (profiles.province)
// — ตัดสินใจเลือกที่มานี้เมื่อ 2026-09-25: เสถียร ไม่ต้องขอสิทธิ์ตำแหน่ง
//   และเป็นพื้นฐานของการแจ้งเตือนตามรอบในอนาคต
// เกณฑ์แจ้งเตือน (เกณฑ์ไทย ประกาศ คพ. 2566 — resech_data.md):
// - ทุกคน: แจ้งเมื่อ ≥ 37.6 µg/m³ (เริ่มมีผลกระทบต่อสุขภาพ)
// - กลุ่มเสี่ยง: แจ้งตั้งแต่ ≥ 25.1 µg/m³ (ปานกลาง) เพราะไวต่อมลพิษกว่า
// - กันสแปม: 1 ครั้ง/วัน/จังหวัด/ระดับ (localStorage)
const NOTIFY_LEVELS_ALL = ['health_impact_start', 'health_impact']
const NOTIFY_LEVELS_SENSITIVE = ['moderate', 'health_impact_start', 'health_impact']
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export function shouldNotifyProvinceAlert({ levelCode, isSensitive, alreadyNotifiedToday }) {
  if (!levelCode || alreadyNotifiedToday) return false
  return (isSensitive ? NOTIFY_LEVELS_SENSITIVE : NOTIFY_LEVELS_ALL).includes(levelCode)
}

export function notifiedKeyToday(province, levelCode) {
  const day = new Date(Date.now() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
  return `riskcare_notified_${province}_${levelCode}_${day}`
}

export async function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unavailable'
  if (Notification.permission !== 'default') return Notification.permission
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

function showProvinceNotification({ province, pm25, tierLabel, isSensitive }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  try {
    new Notification(`ฝุ่น PM2.5 จังหวัด${province}`, {
      body: isSensitive
        ? `${tierLabel} — ${pm25} µg/m³ · คุณอยู่ในกลุ่มเสี่ยง ควรดูแลตัวเองเป็นพิเศษ`
        : `${tierLabel} — ${pm25} µg/m³`,
      tag: `riskcare-pm25-${province}`,
      icon: '/favicon.svg',
    })
    return true
  } catch { return false }
}

// จุดเชื่อมเดียวจาก Pm25AlertCard: เรียกหลังคำนวณค่าเฉลี่ยจังหวัดของโปรไฟล์เสร็จ
// คืน true เมื่อแจ้งเตือนจริง, false เมื่อไม่ผ่านเกณฑ์/สิทธิ์/แจ้งไปแล้ววันนี้
export async function notifyProvincePm25IfDue({ province, pm25, tier, isSensitive }) {
  if (!province || !tier?.level_code || !Number.isFinite(Number(pm25))) return false
  const levelCode = tier.level_code
  const key = notifiedKeyToday(province, levelCode)
  let alreadyNotifiedToday = false
  try { alreadyNotifiedToday = localStorage.getItem(key) === '1' } catch { /* storage อาจใช้ไม่ได้ */ }
  if (!shouldNotifyProvinceAlert({ levelCode, isSensitive, alreadyNotifiedToday })) return false
  const permission = await ensureNotificationPermission()
  if (permission !== 'granted') return false
  const shown = showProvinceNotification({ province, pm25: Number(pm25).toFixed(1), tierLabel: tier.label_th, isSensitive })
  if (shown) {
    try { localStorage.setItem(key, '1') } catch { /* ยอมรับการแจ้งซ้ำได้ถ้า storage พัง */ }
  }
  return shown
}
