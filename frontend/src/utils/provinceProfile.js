export function createProvinceProfileUpdate(province) {
  return { province: String(province || '').trim() || null }
}

export function createProvinceDustQuery(province) {
  return { province: String(province || '').trim(), fallback: 'no-station-data' }
}

export function getProvinceFallbackState(stations) {
  return Array.isArray(stations) && stations.length > 0 ? 'ready' : 'no-station-data'
}
