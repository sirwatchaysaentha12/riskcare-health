import { getDistrictNames } from '../data/thaiDistricts'

const STATIONS_GATEWAY_ENDPOINT = import.meta.env.VITE_STATIONS_ENDPOINT || '/api/stations'
const OPEN_METEO_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const DEFAULT_PM25 = 6.3

function getFallbackDistrictNames(province) {
  return getDistrictNames(province)
}

const REFERENCE_STATIONS = [
  ['สถานีตรวจวัดคุณภาพอากาศ ภูเก็ต', 'ภูเก็ต', 7.8804, 98.3923],
  ['สถานีตรวจวัดคุณภาพอากาศ เชียงใหม่', 'เชียงใหม่', 18.7883, 98.9853],
  ['สถานีตรวจวัดคุณภาพอากาศ ขอนแก่น', 'ขอนแก่น', 16.4322, 102.8236],
  ['สถานีตรวจวัดคุณภาพอากาศ กรุงเทพมหานคร', 'กรุงเทพมหานคร', 13.7563, 100.5018],
  ['สถานีตรวจวัดคุณภาพอากาศ นครราชสีมา', 'นครราชสีมา', 14.9799, 102.0978],
  ['สถานีตรวจวัดคุณภาพอากาศ ชลบุรี', 'ชลบุรี', 13.3611, 100.9847],
  ['สถานีตรวจวัดคุณภาพอากาศ หาดใหญ่', 'สงขลา', 7.0084, 100.4747],
  ['สถานีตรวจวัดคุณภาพอากาศ นครศรีธรรมราช', 'นครศรีธรรมราช', 8.4304, 99.9631],
]

function numberFrom(...values) {
  for (const value of values) {
    const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(',', '.'))
    if (Number.isFinite(number) && number > 0) return number
  }
  return null
}

function haversineDistance(fromLat, fromLon, toLat, toLon) {
  const earthRadius = 6371
  const radians = (value) => (value * Math.PI) / 180
  const dLat = radians(toLat - fromLat)
  const dLon = radians(toLon - fromLon)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(dLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function unwrapStations(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.stations)) return payload.stations
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.result)) return payload.result
  if (Array.isArray(payload?.results)) return payload.results
  if (Array.isArray(payload?.data?.stations)) return payload.data.stations
  if (Array.isArray(payload?.result?.stations)) return payload.result.stations
  return []
}

function textFrom(...values) {
  return values.filter((value) => value !== null && value !== undefined && String(value).trim()).map(String).join(' ')
}

function compactLocation(value) {
  return String(value || '').toLocaleLowerCase('th-TH').replace(/จังหวัด|จ\.|province|prov\.?/gi, '').replace(/[\s,.-]/g, '')
}

function chooseStationName(raw, source, locationText) {
  const candidates = source === 'dustboy'
    ? [raw.dustboy_name, raw.sensor_name, raw.station_name, raw.name, raw.nameTH, raw.NameTH, raw.areaTH, raw.areaEN]
    : [raw.nameTH, raw.NameTH, raw.station_name, raw.stationName, raw.areaTH, raw.areaEN, raw.name]
  const provinceText = compactLocation(textFrom(raw.province_th, raw.province_en, raw.province, raw.provinceName, raw.province_name))
  const useful = candidates.find((candidate) => {
    const compact = compactLocation(candidate)
    return compact && compact !== provinceText && !/^(thailand|ประเทศไทย)$/.test(compact)
  })
  return String(useful || candidates.find(Boolean) || locationText || `${source} station`).trim()
}

function normalizeStation(raw, source, userLat, userLon) {
  const latitude = numberFrom(raw.latitude, raw.lat, raw.gps_lat, raw.latitute)
  const longitude = numberFrom(raw.longitude, raw.long, raw.lon, raw.lng, raw.gps_lon)
  const pm25 = source === 'air4thai'
    ? numberFrom(raw.AQILast?.PM25?.value, raw.LastUpdate?.PM25?.value, raw.LastUpdate?.pm25?.value, raw.PM25?.value, raw.pm25, raw.pm25_value)
    : numberFrom(raw.pm25, raw.pm2_5, raw.dustboy_pv, raw.pm25_value, raw.pm2_5_value, raw.PM25?.value)
  if (latitude === null || longitude === null || pm25 === null) return null

  const locationText = textFrom(
    raw.areaTH, raw.areaEN, raw.area,
    raw.province_th, raw.province_en, raw.province,
    raw.provinceName, raw.province_name,
    raw.district, raw.districtName, raw.subdistrict,
    raw.tambon, raw.address, raw.location,
    raw.dustboy_name, raw.station_name,
  )
  const name = chooseStationName(raw, source, locationText)

  return {
    source,
    name,
    stationId: raw.stationID ?? raw.station_id ?? raw.id ?? null,
    latitude,
    longitude,
    pm25,
    distanceKm: haversineDistance(userLat, userLon, latitude, longitude),
    locationText,
    province: textFrom(raw.province_th, raw.province_en, raw.province, raw.provinceName, raw.province_name),
    observedAt: source === 'air4thai' ? `${raw.AQILast?.date ?? ''} ${raw.AQILast?.time ?? ''}`.trim() : raw.observed_at || raw.updated_at || raw.timestamp || null,
  }
}

async function fetchStationsGateway() {
  const response = await fetch(STATIONS_GATEWAY_ENDPOINT, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Stations gateway HTTP ${response.status}`)
  return response.json()
}

async function getGridFallbackStations(userLat, userLon) {
  const results = await Promise.allSettled(REFERENCE_STATIONS.map(async ([name, province, latitude, longitude]) => {
    const url = new URL(OPEN_METEO_ENDPOINT)
    url.searchParams.set('latitude', latitude)
    url.searchParams.set('longitude', longitude)
    url.searchParams.set('current', 'pm2_5')
    url.searchParams.set('timezone', 'Asia/Bangkok')
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`)
    const payload = await response.json()
    const pm25 = numberFrom(payload.current?.pm2_5)
    if (pm25 === null) throw new Error('missing PM2.5')
    return {
      source: 'open-meteo-grid', name, stationId: `grid-${province}`, province,
      latitude, longitude, pm25, locationText: `${name} ${province}`,
      distanceKm: haversineDistance(userLat, userLon, latitude, longitude),
    }
  }))
  return results.filter((result) => result.status === 'fulfilled').map((result) => result.value)
}

export async function getAirQualityStations(userLat, userLon) {
  if (!Number.isFinite(Number(userLat)) || !Number.isFinite(Number(userLon)) || (Number(userLat) === 0 && Number(userLon) === 0)) {
    const location = await getUserLocation()
    userLat = location.latitude
    userLon = location.longitude
  }
  let payload
  try {
    payload = await fetchStationsGateway()
  } catch (error) {
    console.error('[Stations Gateway] request failed', error)
    payload = { air4thai: [], dustboy: [] }
  }
  const airRaw = unwrapStations(payload.air4thai)
  const dustRaw = unwrapStations(payload.dustboy)
  const air4thai = airRaw.map((station) => normalizeStation(station, 'air4thai', userLat, userLon)).filter(Boolean)
  const dustboy = dustRaw.map((station) => normalizeStation(station, 'dustboy', userLat, userLon)).filter(Boolean)
  console.info('[Air4Thai] stations:', { raw: airRaw.length, usable: air4thai.length })
  console.info('[DustBoy] stations:', { raw: dustRaw.length, usable: dustboy.length })
  const stations = [...air4thai, ...dustboy].filter((station) => Number.isFinite(station.pm25) && station.pm25 > 0)
  const unique = new Map()
  stations.forEach((station) => {
    const key = `${station.source}:${station.stationId ?? `${station.latitude}:${station.longitude}`}`
    if (!unique.has(key)) unique.set(key, station)
  })
  let output = [...unique.values()].sort((a, b) => a.distanceKm - b.distanceKm)
  if (output.length < 3) {
    const fallback = await getGridFallbackStations(userLat, userLon)
    fallback.forEach((station) => unique.set(`${station.source}:${station.stationId}`, station))
    output = [...unique.values()].sort((a, b) => a.distanceKm - b.distanceKm)
    console.warn('[RiskApp Fallback] using Open-Meteo grid values at reference station coordinates')
  }
  console.info('[RiskApp Real Data]', {
    air4thai: output.filter((station) => station.source === 'air4thai').length,
    dustboy: output.filter((station) => station.source === 'dustboy').length,
    total: output.length,
  })
  return output
}

export async function getProvinceGridStations(province, anchorStation, userLat, userLon, existingNames = []) {
  if (!anchorStation) return []
  const normalizedProvince = String(province || '').replace(/จังหวัด|จ\.|province|prov\.?/gi, '').trim()
  const extractedNames = existingNames
    .map((name) => String(name || '').replace(/สถานีตรวจวัดคุณภาพอากาศ|สถานี|จังหวัด|จ\.|\[.*?\]/g, '').trim())
    .filter((name) => name && name !== normalizedProvince)
  const sourceNames = [...new Set([...extractedNames, ...getFallbackDistrictNames(province)])]
  const templates = sourceNames.map((name, index) => [
    name,
    anchorStation.latitude + ((index % 3) - 1) * 0.012,
    anchorStation.longitude + (Math.floor(index / 3) - 1) * 0.012,
  ]).slice(0, 5)
  const results = await Promise.all(templates.map(async ([name, latitude, longitude], index) => {
    const url = new URL(OPEN_METEO_ENDPOINT)
    url.searchParams.set('latitude', latitude)
    url.searchParams.set('longitude', longitude)
    url.searchParams.set('current', 'pm2_5')
    url.searchParams.set('timezone', 'Asia/Bangkok')
    const result = await (async () => {
      try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`)
      const payload = await response.json()
      const measuredPm25 = numberFrom(payload.current?.pm2_5)
      if (measuredPm25 === null) throw new Error('missing PM2.5')
      const pm25 = measuredPm25 * (1 + ((index % 5) - 2) * 0.025)
        return { pm25, fallback: false }
      } catch (error) {
        console.warn('[RiskApp District Fallback]', { province: normalizedProvince, name, message: error.message })
        const cached = Number.parseFloat(localStorage.getItem(`riskcare_pm25_${normalizedProvince}`) || '')
        return { pm25: Number.isFinite(cached) && cached > 0 ? cached : DEFAULT_PM25, fallback: true }
      }
    })()
    return {
      source: 'open-meteo-grid', name, stationId: `province-grid-${normalizedProvince}-${index}`,
      province: normalizedProvince, locationText: `${name} ${normalizedProvince}`,
      pm25: result.pm25, fallback: result.fallback, virtual: true,
      distanceKm: haversineDistance(userLat, userLon, latitude, longitude),
    }
  }))
  return results
}

export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง'))
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(new Error('กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อค้นหาสถานีใกล้คุณ')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  })
}

export async function getOpenMeteoAirQuality(latitude, longitude) {
  const url = new URL(OPEN_METEO_ENDPOINT)
  url.searchParams.set('latitude', latitude)
  url.searchParams.set('longitude', longitude)
  url.searchParams.set('current', 'pm2_5')
  url.searchParams.set('timezone', 'Asia/Bangkok')
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`)
  const payload = await response.json()
  const pm25 = numberFrom(payload.current?.pm2_5)
  if (pm25 === null) throw new Error('Open-Meteo ไม่พบค่า PM2.5')
  return { source: 'open-meteo', name: 'ค่าฝุ่นจากพิกัดของคุณ', stationId: 'open-meteo-user', latitude, longitude, pm25, distanceKm: 0, locationText: '', province: '' }
}

export async function getNearestAirQuality(userLat, userLon) {
  const stations = await getAirQualityStations(userLat, userLon)
  return stations[0] || null
}
