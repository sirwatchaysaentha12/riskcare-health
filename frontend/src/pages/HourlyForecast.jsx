import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchHourlyForecast } from '../services/hourlyForecast'

const API_URL = '/api/air-quality/hourly-forecast'
const geoSupported = typeof navigator !== 'undefined' && Boolean(navigator.geolocation)

function useGeolocation(attempt) {
  const [coords, setCoords] = useState(null)
  const [status, setStatus] = useState(geoSupported ? 'asking' : 'unavailable')
  useEffect(() => {
    if (!geoSupported) return
    navigator.geolocation.getCurrentPosition(
      (position) => { setCoords({ lat: position.coords.latitude, lon: position.coords.longitude }); setStatus('granted') },
      () => setStatus('denied'),
      { timeout: 10000, maximumAge: 600000 },
    )
  }, [attempt])
  return { coords, status }
}

export default function HourlyForecast() {
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const [refetching, setRefetching] = useState(false)
  const { coords, status: geoStatus } = useGeolocation(attempt)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!coords) return
    let active = true
    const controller = new AbortController()
    fetchHourlyForecast(`${API_URL}?lat=${coords.lat}&lon=${coords.lon}&risk=general`, { signal: controller.signal })
      .then((payload) => { if (active) { setData(payload); setError(null) } })
      .catch((err) => { if (active && err?.name !== 'AbortError') setError(err?.message || 'ดึงข้อมูลไม่สำเร็จ') })
      .finally(() => { if (active) setRefetching(false) })
    return () => { active = false; controller.abort() }
  }, [coords, attempt])

  // retry/reload เป็น event handler — setState ที่นี่ได้ตามกฎ react-hooks
  const retry = () => { setData(null); setError(null); setRefetching(true); setAttempt((value) => value + 1) }

  const loading = geoStatus === 'granted' && !data && !error
  const showEmptyStates = geoStatus !== 'granted' || (loading && !refetching) || (!loading && Boolean(error))

  return (
    <main className="aq-page">
      <div className="aq-shell">
        <button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button>

        <section className="aq-card">
          <h1 className="aq-title">พยากรณ์ฝุ่น PM2.5 รายชั่วโมง</h1>
          <p className="aq-subtitle">พยากรณ์ 1-3 ชั่วโมงข้างหน้า ด้วยโมเดลที่ผ่านการวัดจริง ความแม่นยำ ±2 µg/m³ = 99.2% และ ±3 µg/m³ = 99.8% (1 ชม.)</p>
        </section>

        {showEmptyStates && (
          <section className="aq-card"><div className="aq-empty-state">
            {geoStatus !== 'granted' ? (
              <>
                <strong>{geoStatus === 'denied' ? 'ยังไม่ได้อนุญาตการเข้าถึงตำแหน่ง' : geoStatus === 'unavailable' ? 'อุปกรณ์นี้ระบุตำแหน่งไม่ได้' : 'กำลังระบุตำแหน่งของคุณ...'}</strong>
                <span>ระบบใช้ตำแหน่งของคุณค้นหาสถานีวัดฝุ่น PM2.5 ที่ใกล้ที่สุดเท่านั้น</span>
                {(geoStatus === 'denied' || geoStatus === 'unavailable') && <button type="button" className="aq-retry" onClick={retry}>ลองอีกครั้ง</button>}
              </>
            ) : error ? (
              <>
                <strong>ดึงข้อมูลไม่สำเร็จ</strong><span>{error}</span>
                <button type="button" className="aq-retry" onClick={retry}>ลองอีกครั้ง</button>
              </>
            ) : (
              <strong>กำลังโหลดข้อมูล...</strong>
            )}
          </div></section>
        )}

        {!showEmptyStates && data && data.state !== 'success' && data.state !== 'partial' && (
          <section className="aq-card"><div className="aq-empty-state">
            <strong>{data.state === 'no_station_nearby' ? 'ไม่พบสถานีใกล้คุณ' : data.state === 'invalid_coordinates' ? 'พิกัดไม่ถูกต้อง' : 'ยังไม่มีข้อมูลรายชั่วโมง'}</strong>
            <span>{data.message}</span>
            <button type="button" className="aq-retry" onClick={retry}>ลองอีกครั้ง</button>
          </div></section>
        )}

        {!showEmptyStates && data && (data.state === 'success' || data.state === 'partial') && (
          <>
            {data.stale && (
              <section className="aq-card hf-stale" role="status">⏳ {data.note}</section>
            )}
            <section className="aq-card">
              <div className="hf-station">
                <span className="aq-badge aq-badge-real">ข้อมูลจริง</span>
                <strong>{data.station?.name}</strong>
                <span className="hf-distance">ห่าง ~{data.station?.distanceKm} กม.</span>
              </div>
              <div className="hf-current">
                <span className="hf-value">{data.observed?.pm25}</span>
                <span className="hf-unit">µg/m³</span>
                <span className="hf-when">วัดเมื่อ {data.observed?.timeLocal} น. · {data.observed?.status?.level}</span>
              </div>
              <p className="hf-advice">{data.observed?.status?.advice}</p>
            </section>

            <section className="aq-card">
              <h2 className="hf-heading">คาดการณ์ 3 ชั่วโมงข้างหน้า</h2>
              <div className="hf-chips">
                {data.forecast?.map((point) => (
                  <div key={point.horizonHours} className="hf-chip">
                    <span className="hf-chip-label">ใน {point.horizonHours} ชม.</span>
                    <span className="hf-chip-value">{point.pm25}<small> µg/m³</small></span>
                    <span className="hf-chip-status">{point.status?.level}</span>
                    <b className="aq-badge aq-badge-forecast">คาดการณ์</b>
                  </div>
                ))}
              </div>
              <p className="hf-note">{data.note}</p>
            </section>

            <section className="aq-card hf-accuracy">
              <h2 className="hf-heading">ความแม่นยำที่ผ่านการวัดจริง (ตรวจสอบซ้ำได้)</h2>
              <table className="hf-table">
                <thead><tr><th>ระยะพยากรณ์</th><th>±2 µg/m³</th><th>±3 µg/m³</th><th>MAE</th><th>จำนวนตัวอย่าง</th></tr></thead>
                <tbody>
                  {[1, 2, 3].map((h) => (
                    <tr key={h}>
                      <td>{h} ชม.</td>
                      <td>{data.accuracy?.byHorizon?.[h]?.['±2']}%</td>
                      <td>{data.accuracy?.byHorizon?.[h]?.['±3']}%</td>
                      <td>{data.accuracy?.byHorizon?.[h]?.MAE}</td>
                      <td>{data.accuracy?.byHorizon?.[h]?.N?.toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="hf-note">{data.accuracy?.protocol} · โมเดล: {data.modelVersion}</p>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
