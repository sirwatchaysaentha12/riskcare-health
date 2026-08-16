import districtData from './thailandDistricts.json' with { type: 'json' }

export const THAI_DISTRICTS = districtData

export function getDistrictNames(province) {
  const clean = String(province || '').replace(/จังหวัด|จ\.|province|prov\.?/gi, '').trim()
  return THAI_DISTRICTS[clean] || []
}
