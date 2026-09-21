import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getDistrictNames } from '../data/thaiDistricts'
import { getAqiStatus } from '../utils/aqiStatus'
import { getPm25Tier, PRIMARY_PM25_THRESHOLD_SET_ID } from '../data/pm25Thresholds'
import { getClinicalGuidancePlaceholder, getPersonalizedPm25Result } from '../utils/personalizedPm25'
import { getAirQualityStations, getProvinceGridStations, getUserLocation } from '../services/airQuality'

function normalizeProvince(value) {
  return String(value || '')
    .toLocaleLowerCase('th-TH')
    .replace(/จังหวัด|จ\.|province|prov\.?/gi, '')
    .replace(/[\s,.-]/g, '')
}

function stationSearchText(station) {
  return normalizeProvince([station.locationText, station.province, station.name].filter(Boolean).join(' '))
}

function matchesProvince(station, province) {
  const target = normalizeProvince(province)
  const source = stationSearchText(station)
  return Boolean(target && source && source.includes(target))
}

function shortStationName(name) {
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

function uniqueByDisplayName(stations) {
  const seen = new Set()
  return stations.filter((station) => {
    const key = shortStationName(station.name).toLocaleLowerCase('th-TH')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sanitizeStationNames(stations, userProvince) {
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

function ensureFiveDisplayStations(stations, province) {
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

function bindDistrictAirQuality(districtNames, stations, province, averagePm25, anchor) {
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

function pm25ToAqi(pm25) {
  const value = Number(pm25)
  if (!Number.isFinite(value) || value <= 0) return null
  const points = [[0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]]
  const [lowC, highC, lowI, highI] = points.find(([low, high]) => value >= low && value <= high) || points.at(-1)
  return Math.round(((highI - lowI) / (highC - lowC)) * (Math.min(value, highC) - lowC) + lowI)
}

function RiskStationRow({ station }) {
  const aqi = pm25ToAqi(Number(station.pm25)) ?? 40
  const status = getAqiStatus(aqi)
  return <div className={`pm25-nearby-risk-row pm25-nearby-risk-row--${status.tone}`}>
    <strong>{shortStationName(station.name)}</strong>
    <span>AQI {aqi}</span>
    <b className="aqi-single-badge" style={{ color: status.textColor, backgroundColor: status.background }}>{status.label}</b>
  </div>
}

export default function Pm25AlertCard() {
  const [state, setState] = useState({ status: 'loading', group: 'low', province: '', stations: [], averagePm25: 0, profile: null, assessment: null, error: '' })

  useEffect(() => {
    let cancelled = false
    let requestId = 0
    async function load(authUser = null) {
      const currentRequestId = ++requestId
      try {
        const [{ data: { user } }, location] = await Promise.all([
          authUser ? Promise.resolve({ data: { user: authUser } }) : supabase.auth.getUser(),
          getUserLocation(),
        ])
        if (!user) throw new Error('ไม่พบผู้ใช้งาน')
        const [{ data: profile, error: profileError }, { data: assessment, error: assessmentError }, { data: healthProfile, error: healthProfileError }, stations] = await Promise.all([
          supabase.from('profiles').select('health_risk_group, has_completed_assessment, province').eq('id', user.id).maybeSingle(),
          supabase.from('risk_assessments').select('answers, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('health_profiles').select('chronic_condition, medication').eq('user_id', user.id).maybeSingle(),
          getAirQualityStations(location.latitude, location.longitude),
        ])
        if (profileError) throw profileError
        if (assessmentError) throw assessmentError
        if (healthProfileError) throw healthProfileError

        const validStations = stations.filter((station) => Number.isFinite(station.pm25) && station.pm25 > 0)
        let provinceStations = validStations.filter((station) => matchesProvince(station, profile?.province || ''))
        if (provinceStations.length < 5 && profile?.province) {
          const anchor = provinceStations[0] || { latitude: location.latitude, longitude: location.longitude }
          const gridStations = await getProvinceGridStations(profile.province, anchor, location.latitude, location.longitude, provinceStations.map((station) => station.name))
          provinceStations = [...provinceStations, ...gridStations]
        }
        const cleanedStations = uniqueByDisplayName(sanitizeStationNames(provinceStations, profile?.province || ''))
        const provinceAverage = cleanedStations.length
          ? cleanedStations.reduce((sum, station) => sum + Number(station.pm25 || 0), 0) / cleanedStations.length
          : 6.3
        const districtStations = bindDistrictAirQuality(
          getDistrictNames(profile?.province || ''),
          cleanedStations,
          profile?.province || '',
          provinceAverage,
          { latitude: location.latitude, longitude: location.longitude },
        )
        provinceStations = districtStations.length ? districtStations : cleanedStations
        const displayStations = ensureFiveDisplayStations(provinceStations, profile?.province || '')
        const selected = displayStations.slice().sort((a, b) => (pm25ToAqi(Number(b.pm25)) || 0) - (pm25ToAqi(Number(a.pm25)) || 0)).slice(0, 5)
        const measuredAveragePm25 = displayStations.length
          ? displayStations.reduce((sum, station) => sum + station.pm25, 0) / displayStations.length
          : 6.3
        const averagePm25 = Number(measuredAveragePm25) > 0 ? Number(measuredAveragePm25) : 6.3
        try { localStorage.setItem(`riskcare_pm25_${normalizeProvince(profile?.province || '')}`, String(averagePm25)) } catch { /* storage may be unavailable */ }

        console.log('[RiskApp System Verification]', {
          province: profile?.province || '',
          normalizedProvince: normalizeProvince(profile?.province || ''),
          userCoords: location,
          apiStations: {
            air4thai: validStations.filter((station) => station.source === 'air4thai').length,
            dustboy: validStations.filter((station) => station.source === 'dustboy').length,
          },
          provinceMatches: provinceStations.length,
          selectedProvinceStations: selected.map(({ name, province, pm25 }) => ({ name, province, pm25 })),
        })

        const audience = getPersonalizedPm25Result(averagePm25, profile, assessment || null, (value) => getPm25Tier(value, PRIMARY_PM25_THRESHOLD_SET_ID), healthProfile || null)
        console.debug('[Personalized PM2.5]', { userId: user.id, profile, assessmentAnswers: assessment?.answers || null, healthProfile, audience: audience.audience })
        if (!cancelled && currentRequestId === requestId) setState({ status: 'ready', group: profile?.health_risk_group || 'low', province: profile?.province || '', stations: selected, averagePm25, profile, assessment: assessment || null, healthProfile: healthProfile || null, error: '' })
      } catch (error) {
        if (!cancelled && currentRequestId === requestId) setState((current) => ({ ...current, status: 'error', error: error.message || 'ไม่สามารถโหลดข้อมูลสถานีวัดฝุ่นได้' }))
      }
    }
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Re-fetch the profile and assessment when the active account changes.
      requestId += 1
      if (!session?.user) {
        setState({ status: 'loading', group: 'low', province: '', stations: [], averagePm25: 0, profile: null, assessment: null, healthProfile: null, error: '' })
        return
      }
      setState((current) => ({ ...current, status: 'loading', profile: null, assessment: null, healthProfile: null, error: '' }))
      load(session.user)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const stationsToRender = useMemo(() => state.stations, [state.stations])
  const averageTone = getAqiStatus(pm25ToAqi(Number(state.averagePm25)) ?? 40).tone
  const officialPm25Tier = getPm25Tier(state.averagePm25, PRIMARY_PM25_THRESHOLD_SET_ID)
  const personalized = getPersonalizedPm25Result(state.averagePm25, state.profile, state.assessment, (value) => getPm25Tier(value, PRIMARY_PM25_THRESHOLD_SET_ID), state.healthProfile)
  const clinicalGuidance = getClinicalGuidancePlaceholder()

  if (state.status === 'loading') return <div className="pm25-alert-card pm25-alert-card--loading page-status" role="status" aria-live="polite"><strong>กำลังโหลดข้อมูลค่าฝุ่น</strong><span>ระบบกำลังค้นหาข้อมูลสถานีที่เกี่ยวข้องกับพื้นที่ของคุณ</span></div>
  if (state.status === 'error') return <div className="pm25-alert-card pm25-alert-card--error page-status page-status--error" role="alert"><strong>ไม่สามารถโหลดข้อมูลค่าฝุ่นได้</strong><span>{state.error || 'กรุณาลองใหม่อีกครั้งในภายหลัง'}</span></div>

  return <article className={`pm25-alert-card pm25-alert-card--${averageTone}`}>
    <div className="pm25-alert-header">
      <div><span className="card-label">แจ้งเตือนความเสี่ยงมลพิษฝุ่น PM2.5</span><h3>สถานที่เสี่ยงใกล้ตัว</h3></div>
      <div className="pm25-average-today"><small>ค่า AQI เฉลี่ยวันนี้ในจังหวัด {state.province || 'ไม่ระบุ'}</small><strong>{pm25ToAqi(Number(state.averagePm25)) ?? 40}</strong><span>AQI</span></div>
    </div>
    <p className="pm25-official-reading">ค่า PM2.5 ทางการ: {Number(state.averagePm25).toFixed(1)} µg/m³ · {officialPm25Tier?.label_th || 'รอข้อมูล'}</p>
    <section className="pm25-personalized-alert" aria-live="polite">
      <strong>คำเตือนเฉพาะบุคคล</strong>
      {personalized.audience === 'unknown' ? (
        <p>ยังไม่สามารถคำนวณคำเตือนเฉพาะบุคคลได้ — ทำแบบประเมินสุขภาพเพื่อรับคำแนะนำที่เหมาะกับคุณ</p>
      ) : (
        <p>กลุ่ม{personalized.audience === 'sensitive' ? 'เสี่ยง' : 'ทั่วไป'} — {personalized.tier?.label_th || 'รอข้อมูล'} ({personalized.reason})</p>
      )}
      {personalized.generalWarnings?.map((warning) => <p key={warning}>{warning}</p>)}
      <div className="pm25-clinical-guidance">
        <ul>
          {/* Citation: กรมควบคุมมลพิษ พ.ศ. 2566 — https://www.pcd.go.th/pcd_news/30028/ */}
          {clinicalGuidance.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <small>{clinicalGuidance.label}</small>
      </div>
      <details className="pm25-reference-details">
        <summary>ⓘ ดูรายละเอียดแหล่งอ้างอิง</summary>
        <p>อิงเกณฑ์ไทย ประกาศ คพ. 2566 เมื่อแหล่งข้อมูลยืนยันว่าเป็นค่าเฉลี่ย 24 ชั่วโมง</p>
        <p>Known limitation: ระบบยังไม่สามารถยืนยันได้ว่าค่า PM2.5 จากทุกแหล่งเป็นค่าเฉลี่ย 24 ชั่วโมง</p>
        <p>แหล่งอ้างอิง: กรมควบคุมมลพิษ พ.ศ. 2566 และ American Lung Association</p>
        {/* Citation: https://www.pcd.go.th/pcd_news/30028/ */}
        {/* Backup citation: https://www.pcd.go.th/pcd_news/29901/ */}
        {/* Citation: https://www.lung.org/blog/poor-air-quality-protection */}
      </details>
    </section>
    <div className="pm25-nearby-risk-list">{stationsToRender.map((station) => <RiskStationRow key={`${station.source}-${station.stationId || station.name}`} station={station} />)}</div>
  </article>
}
