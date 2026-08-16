import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getAirQualityStations, getNearestAirQuality, getUserLocation } from '../services/airQuality'
import { getAqiStatus, pm25ToAqi } from '../utils/aqiStatus'

const regions = ['เหนือ', 'กลาง', 'ตะวันออกเฉียงเหนือ', 'ใต้']
const regionProvinces = {
  'เหนือ': 'เชียงใหม่ เชียงราย ลำปาง ลำพูน แม่ฮ่องสอน น่าน พะเยา แพร่ อุตรดิตถ์ พิษณุโลก สุโขทัย เพชรบูรณ์ กำแพงเพชร พิจิตร ตาก',
  'กลาง': 'กรุงเทพ นนทบุรี ปทุมธานี สมุทรปราการ สมุทรสาคร นครปฐม อยุธยา สระบุรี ลพบุรี ราชบุรี กาญจนบุรี เพชรบุรี ประจวบ ชัยนาท นครสวรรค์ อ่างทอง สิงห์บุรี สุพรรณบุรี',
  'ตะวันออกเฉียงเหนือ': 'ขอนแก่น นครราชสีมา อุดรธานี อุบลราชธานี บุรีรัมย์ สุรินทร์ ศรีสะเกษ ร้อยเอ็ด มหาสารคาม กาฬสินธุ์ สกลนคร นครพนม มุกดาหาร ยโสธร ชัยภูมิ หนองคาย เลย',
  'ใต้': 'ชุมพร สุราษฎร์ นครศรีธรรมราช กระบี่ พังงา ภูเก็ต ตรัง พัทลุง สงขลา สตูล ปัตตานี ยะลา นราธิวาส ระนอง'
}
function groupOf(station) {
  const province = station.province || ''
  return regions.find((region) => regionProvinces[region].includes(province)) || station.region || ''
}
function toneOf(pm25) { return getAqiStatus(pm25ToAqi(pm25)).tone }
function adviceOf(pm25, group) { return pm25 > 75 ? 'งดกิจกรรมนอกอาคารเด็ดขาด' : pm25 > 37.5 && group !== 'low' ? 'หลีกเลี่ยงกิจกรรมกลางแจ้ง' : pm25 > 37.5 ? 'สวมหน้ากากเมื่อต้องออกนอกอาคาร' : group === 'high_critical' ? 'ออกได้อย่างระมัดระวังและสังเกตอาการ' : 'ทำกิจกรรมนอกอาคารได้ตามปกติ' }
function riskName(pm25) { return getAqiStatus(pm25ToAqi(pm25)).label }

function RiskSpotCard({ station, group }) {
  const tone = toneOf(station.pm25)
  return <article className={`overview-spot-card overview-spot-card--${tone}`}>
    <div className="overview-spot-title"><strong>{station.name}</strong><span className={`overview-risk-badge overview-risk-badge--${tone}`}>{riskName(station.pm25)}</span></div>
    <small>{station.province || 'ไม่ทราบจังหวัด'} · {station.distanceKm.toFixed(1)} กม.</small>
    <div className="overview-spot-pm"><b>{station.pm25.toFixed(1)}</b><span>µg/m³</span></div>
    <p>{adviceOf(station.pm25, group)}</p>
  </article>
}

export default function Overview() {
  const [state, setState] = useState({ status: 'loading', group: 'low', province: '', stations: [], error: '' })
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [{ data: { user } }, location] = await Promise.all([supabase.auth.getUser(), getUserLocation()])
        if (!user) throw new Error('ไม่พบผู้ใช้งาน')
        const [{ data: profile, error: profileError }, stations] = await Promise.all([
          supabase.from('profiles').select('health_risk_group, region, province').eq('id', user.id).maybeSingle(),
          getAirQualityStations(location.latitude, location.longitude),
        ])
        if (profileError) throw profileError
        let available = stations
        if (!available.length) {
          const fallback = await getNearestAirQuality(location.latitude, location.longitude)
          available = fallback.source === 'open-meteo' ? [] : [fallback]
        }
        if (!cancelled) setState({ status: 'ready', group: profile?.health_risk_group || 'low', province: profile?.province || available[0]?.province || '', stations: available, error: '' })
      } catch (error) { if (!cancelled) setState((current) => ({ ...current, status: 'error', error: error.message || 'ไม่สามารถโหลดข้อมูลภาพรวมได้' })) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const regional = useMemo(() => regions.map((region) => {
    const items = state.stations.filter((station) => groupOf(station).includes(region))
    const average = items.length ? items.reduce((sum, item) => sum + item.pm25, 0) / items.length : 0
    const top = [...new Map(items.map((item) => [item.province || item.name, item])).values()].sort((a, b) => b.pm25 - a.pm25).slice(0, 3)
    return { region, average, top }
  }), [state.stations])
  const currentProvinceTop = useMemo(() => state.stations.filter((station) => station.province?.includes(state.province) || state.province?.includes(station.province)).sort((a, b) => b.pm25 - a.pm25).slice(0, 3), [state.stations, state.province])
  const touristSpots = useMemo(() => state.stations.filter((station) => station.province?.includes(state.province) || state.province?.includes(station.province)).sort((a, b) => b.pm25 - a.pm25).slice(0, 3), [state.stations, state.province])

  if (state.status === 'loading') return <main className="overview-page"><div className="page-status" role="status" aria-live="polite"><strong>กำลังโหลดภาพรวมค่าฝุ่น</strong><span>ระบบกำลังรวบรวมข้อมูลจากสถานีตรวจวัด</span></div></main>
  if (state.status === 'error') return <main className="overview-page"><div className="page-status page-status--error" role="alert"><strong>ไม่สามารถโหลดภาพรวมได้</strong><span>{state.error || 'กรุณาลองใหม่อีกครั้ง'}</span></div></main>
  return <main className="overview-page">
    <header className="overview-header"><div><span className="eyebrow">PM2.5 RISK OVERVIEW</span><h1>ภาพรวมความเสี่ยงฝุ่น PM2.5</h1><p>{state.province ? `จังหวัด ${state.province}` : 'ภาพรวมจากจุดตรวจวัดที่มีข้อมูล'}</p></div><Link to="/" className="overview-back-link">กลับหน้าหลัก</Link></header>
    <section className="overview-section"><h2>อันดับ 3 จุดเสี่ยงสูงสุดในจังหวัด</h2><div className="overview-spot-grid">{currentProvinceTop.length ? currentProvinceTop.map((station) => <RiskSpotCard key={`province-${station.name}`} station={station} group={state.group} />) : <p>ยังไม่มีข้อมูลสถานีในจังหวัดนี้</p>}</div></section>
    <section className="overview-section"><h2>ภาพรวมความเสี่ยง 4 ภาค</h2><div className="overview-region-grid">{regional.map((item) => <article className="overview-region-card" key={item.region}><header><strong>ภาค{item.region}</strong><span>เฉลี่ย {item.average ? item.average.toFixed(1) : 'รอข้อมูล'} µg/m³</span></header>{item.top.length ? item.top.map((station) => <div className="overview-region-row" key={`${item.region}-${station.name}`}><span>{station.province || station.name}</span><b>{station.pm25.toFixed(1)}</b></div>) : <small>ยังไม่มีข้อมูลสถานีในภูมิภาคนี้</small>}</article>)}</div></section>
    <section className="overview-section"><h2>สถานที่/จุดตรวจวัดที่ควรหลีกเลี่ยงสำหรับคุณ</h2><p className="overview-description">ประเมินตามค่า PM2.5 และกลุ่มความเสี่ยงส่วนบุคคลของคุณ ({state.group === 'high_critical' ? 'สูง/ฉุกเฉิน' : state.group === 'moderate' ? 'ปานกลาง' : 'ต่ำ'})</p><div className="overview-spot-grid">{touristSpots.length ? touristSpots.map((station) => <RiskSpotCard key={`tourist-${station.name}`} station={station} group={state.group} />) : <p>ยังไม่มีข้อมูลจุดตรวจวัดสำหรับพื้นที่นี้</p>}</div></section>
  </main>
}
