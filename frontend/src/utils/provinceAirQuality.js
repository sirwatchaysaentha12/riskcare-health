import { getProvinceAreas } from '../data/districtCoords'
import { fetchOpenMeteoPm25 } from '../services/airQuality'
import { matchesProvince } from './pm25Stations'

// pipeline รายจังหวัด (ใช้ร่วม Home + Overview):
// ดึงค่าฝุ่น "จริง" ของทุกพื้นที่ในจังหวัด — พื้นที่ใดมีสถานีตรวจวัดใกล้ ≤ 12 กม. ใช้ค่าวัดจริงของสถานีนั้น
// ไม่งั้นดึงค่าจากแหล่งข้อมูลบรรยากาศ ณ พิกัดจริงของพื้นที่นั้น (ค่าตอบกลับจาก API เท่านั้น)
// ไม่มีการสุ่มหรือบวกเลขจำลอง — พื้นที่ที่ดึงไม่สำเร็จถูกตัดออกจากการจัดอันดับ
const NEAREST_STATION_KM = 12

function normalizeProvinceKey(value) {
  return String(value || '').toLocaleLowerCase('th-TH').replace(/[\s,.-]/g, '')
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = (v) => (v * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLon = rad(bLon - aLon)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export async function computeProvinceAreas(allStations, province) {
  const areas = getProvinceAreas(province) // ≥5 พื้นที่ทุกจังหวัด (อำเภอ + พื้นที่สำคัญกรณีอำเภอน้อย)
  if (!areas.length) return { ranked: [], allAreas: [], averagePm25: 0, updatedAt: null }

  const provinceStations = (allStations || []).filter((station) =>
    Number.isFinite(station.pm25) && station.pm25 > 0 && matchesProvince(station, province))

  const settled = await Promise.allSettled(areas.map(async (area) => {
    let nearest = null
    let nearestKm = Infinity
    for (const station of provinceStations) {
      const km = distanceKm(area.latitude, area.longitude, station.latitude, station.longitude)
      if (km < nearestKm) { nearestKm = km; nearest = station }
    }
    if (nearest && nearestKm <= NEAREST_STATION_KM) {
      return { name: area.name, province, pm25: Number(nearest.pm25), updatedAt: nearest.observedAt || null }
    }
    const fetched = await fetchOpenMeteoPm25(area.latitude, area.longitude)
    return { name: area.name, province, pm25: Number(fetched.pm25), updatedAt: fetched.timeLocal }
  }))

  const allAreas = settled
    .filter((result) => result.status === 'fulfilled' && Number.isFinite(result.value.pm25) && result.value.pm25 > 0)
    .map((result) => result.value)
  if (!allAreas.length) throw new Error('ไม่สามารถดึงข้อมูลคุณภาพอากาศของจังหวัดนี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง')

  const averagePm25 = allAreas.reduce((sum, area) => sum + area.pm25, 0) / allAreas.length
  const ranked = allAreas.slice().sort((a, b) => b.pm25 - a.pm25)
  const updatedAt = allAreas.map((area) => area.updatedAt).filter(Boolean).sort().at(-1) || null
  try {
    localStorage.setItem(`riskcare_pm25_${normalizeProvinceKey(province)}`, String(averagePm25))
  } catch { /* storage may be unavailable */ }
  console.log('[RiskApp System Verification]', {
    province,
    areasTotal: areas.length,
    areasFetched: allAreas.length,
    provinceStations: provinceStations.length,
    top: ranked.slice(0, 5).map(({ name, pm25 }) => ({ name, pm25 })),
    averagePm25,
  })
  return { ranked, allAreas, averagePm25, updatedAt }
}
