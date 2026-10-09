import { getDistrictNames } from '../data/thaiDistricts'

// Pure helpers สำหรับคำนวณสถานี PM2.5 รายจังหวัด — ย้ายมาจาก components/Pm25AlertCard.jsx
// แบบคำต่อคำ (verbatim) เพื่อให้ Home.jsx และ Pm25AlertCard ใช้ logic ชุดเดียวกัน
// ห้ามแก้พฤติกรรมที่นี่ ถ้าจะแก้ให้แก้ที่เดียวและเทียบค่าก่อน-หลัง

export function normalizeProvince(value) {
  return String(value || '')
    .toLocaleLowerCase('th-TH')
    .replace(/จังหวัด|จ\.|province|prov\.?/gi, '')
    .replace(/[\s,.-]/g, '')
}

function stationSearchText(station) {
  return normalizeProvince([station.locationText, station.province, station.name].filter(Boolean).join(' '))
}

export function matchesProvince(station, province) {
  const target = normalizeProvince(province)
  const source = stationSearchText(station)
  return Boolean(target && source && source.includes(target))
}

export function shortStationName(name) {
  return String(name || 'จุดตรวจวัด')
    .replace(/สถานีตรวจวัดคุณภาพอากาศ|สถานี|จังหวัด|จ\.|\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'จุดตรวจวัด'
}

function compactName(value) {
  return String(value || '').toLocaleLowerCase('th-TH').replace(/[\s,.-]/g, '')
}

function isForbiddenProvinceName(name, province) {
  const cleanedName = compactName(name)
  const cleanedProvince = compactName(province)
  if (!cleanedName || !cleanedProvince) return false
  const blacklist = new RegExp(`^(?:จังหวัด|เมือง|อำเภอเมือง|อเมือง)${cleanedProvince}$`)
  return cleanedName === cleanedProvince || blacklist.test(cleanedName)
}

export function uniqueByDisplayName(stations) {
  const seen = new Set()
  return stations.filter((station) => {
    const key = shortStationName(station.name).toLocaleLowerCase('th-TH')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function sanitizeStationNames(stations, userProvince) {
  const province = String(userProvince || '').trim()
  const usedNames = new Set()
  return stations.filter((station) => {
    const name = shortStationName(station.name)
    if (isForbiddenProvinceName(name, province) || usedNames.has(compactName(name))) return false
    usedNames.add(compactName(name))
    station.name = name
    return true
  })
}

export function ensureFiveDisplayStations(stations, province) {
  const output = [...stations]
  const seed = output[0]
  if (!seed) return output.slice(0, 5)
  const fallbackNames = getDistrictNames(province)
  let fallbackIndex = 0
  while (output.length < 5) {
    const name = fallbackNames[fallbackIndex] || ''
    fallbackIndex += 1
    if (!name) break
    if (!output.some((station) => compactName(station.name) === compactName(name))) {
      output.push({
        ...seed,
        name,
        stationId: `${seed.stationId || 'station'}-display-fallback-${fallbackIndex}`,
        fallback: true,
      })
    }
    fallbackIndex += 1
  }
  return output.slice(0, 5)
}

export function bindDistrictAirQuality(districtNames, stations, province, averagePm25, anchor) {
  const districts = Array.isArray(districtNames) ? districtNames : []
  const usedStationIds = new Set()
  const safeAverage = Number(averagePm25) > 0 ? Number(averagePm25) : 6.3
  return districts.map((district, index) => {
    const districtKey = normalizeProvince(district)
    const matched = stations.find((station) => {
      const stationKey = normalizeProvince([station.name, station.locationText, station.province].filter(Boolean).join(' '))
      const stationId = `${station.source}-${station.stationId || station.name}`
      return stationKey.includes(districtKey) && !usedStationIds.has(stationId)
    })
    const stationId = matched ? `${matched.source}-${matched.stationId || matched.name}` : ''
    if (matched) usedStationIds.add(stationId)
    const basePm25 = Number(matched?.pm25) > 0 ? Number(matched.pm25) : safeAverage
    const pm25 = matched ? basePm25 : basePm25 * (1 + ((index % 5) - 2) * 0.025)
    return {
      ...(matched || {}),
      name: district,
      province,
      pm25: Number(pm25) > 0 ? Number(pm25) : 6.3,
      stationId: matched?.stationId || `district-${normalizeProvince(province)}-${index}`,
      latitude: matched?.latitude || anchor?.latitude || 0,
      longitude: matched?.longitude || anchor?.longitude || 0,
      fallback: !matched,
    }
  })
}

export function pm25ToAqi(pm25) {
  const value = Number(pm25)
  if (!Number.isFinite(value) || value <= 0) return null
  const points = [[0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]]
  const [lowC, highC, lowI, highI] = points.find(([low, high]) => value >= low && value <= high) || points.at(-1)
  return Math.round(((highI - lowI) / (highC - lowC)) * (Math.min(value, highC) - lowC) + lowI)
}
