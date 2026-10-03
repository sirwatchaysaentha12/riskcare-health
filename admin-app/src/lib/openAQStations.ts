// Pure station-selection logic for the OpenAQ nearest-station search.
// No imports so `node --test` can run it standalone.

export type StationCandidate = {
  locationId: number
  sensorId: number
  stationName: string
  provider: string
  distanceKm: number
  latitude: number
  longitude: number
}

export function isValidLatLng(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// เลือกสถานี: ถ้ามี provider Air4Thai เลือกใกล้สุดจากกลุ่มนั้น มิฉะนั้นเลือกสถานี PM2.5 ใกล้สุด
// ไม่มีสถานีเลยคืน null (caller ต้องรายงาน "ไม่มีสถานีใกล้เคียง" ห้าม fallback เงียบ ๆ)
export function selectNearestStation(candidates: StationCandidate[]): StationCandidate | null {
  const valid = candidates.filter((c) => Number.isFinite(c.distanceKm) && Number.isFinite(c.locationId) && Number.isFinite(c.sensorId))
  if (!valid.length) return null
  const air4thai = valid.filter((c) => /air\s*4\s*thai/i.test(c.provider))
  return (air4thai.length ? air4thai : valid).sort((a, b) => a.distanceKm - b.distanceKm)[0]
}
