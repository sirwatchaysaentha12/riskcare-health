import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchHourlyForecast } from '../services/hourlyForecast'
import { useProvinceAirLocation } from '../hooks/useProvinceAirLocation'

const API_URL = '/api/air-quality/hourly-forecast'

export default function HourlyForecast() {
  const navigate = useNavigate()
  // ตรรกะเดียวกับ /air-quality-trend: จังหวัดจาก profiles.province เป็นหลัก, GPS เป็นตัวเลือกเสริม
  const { provinceState, province, coords, mode, gpsStatus, requestGps, backToProfileProvince } = useProvinceAirLocation()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    if (!coords || provinceState !== 'ready') return undefined
    let active = true
    const controller = new AbortController()
    fetchHourlyForecast(`${API_URL}?lat=${coords.latitude}&lon=${coords.longitude}&risk=general`, { signal: controller.signal })
      .then((payload) => { if (active) { setData(payload); setError(null) } })
      .catch((err) => { if (active && err?.name !== 'AbortError') setError(err?.message || 'ดึงข้อมูลไม่สำเร็จ') })
    return () => { active = false; controller.abort() }
  }, [coords, provinceState, requestVersion])

  const retry = () => { setData(null); setError(null); setRequestVersion((version) => version + 1) }

  return (
    <main className="aq-page">
      <div className="aq-shell">
        <button type="button" className="aq-back" onClick={() => navigate(-1)}>← กลับ</button>

        <section className="aq-card">
          <h1 className="aq-title">พยากรณ์ฝุ่น PM2.5 รายชั่วโมง</h1>
          <p className="aq-subtitle">พยากรณ์ 1-3 ชั่วโมงข้างหน้า</p>
          {provinceState === 'ready' && (
            <p className="aq-source-status" role="status">
              {mode === 'gps' ? 'ข้อมูลตามตำแหน่งปัจจุบัน (GPS)' : province ? `ข้อมูลตามโปรไฟล์ (${province})` : 'ยังไม่ได้ตั้งจังหวัดในโปรไฟล์'}
            </p>
          )}
        </section>

        {provinceState === 'loading' && (
          <section className="aq-card"><div className="aq-empty-state"><strong>กำลังโหลดข้อมูล...</strong></div></section>
        )}

        {provinceState === 'ready' && !data && !error && (
          <section className="aq-card"><div className="aq-empty-state" role="status"><strong>กำลังโหลดข้อมูลพยากรณ์...</strong></div></section>
        )}

        {provinceState === 'no-province' && (
          <section className="aq-card"><div className="aq-empty-state">
            <strong>{province ? `ไม่พบพิกัดอ้างอิงของจังหวัด${province} ในระบบ` : 'คุณยังไม่ได้ตั้งค่าจังหวัดในโปรไฟล์'}</strong>
            <span>หน้านี้แสดงค่าฝุ่นตามจังหวัดที่บันทึกไว้ในโปรไฟล์ของคุณเท่านั้น — ไปตั้งค่าจังหวัดก่อน หรือใช้ตำแหน่งปัจจุบันของอุปกรณ์แทน (ตัวเลือกเสริม)</span>
            <Link className="aq-retry" to="/profile">ไปตั้งค่าจังหวัดที่หน้าโปรไฟล์</Link>
            {gpsStatus === 'asking' ? (
              <span>กำลังขอตำแหน่งปัจจุบัน...</span>
            ) : gpsStatus === 'denied' ? (
              <><span>ยังไม่ได้อนุญาตการเข้าถึงตำแหน่ง — กดใหม่อีกครั้งเพื่อลองถามสิทธิ์</span><button type="button" className="aq-retry" onClick={requestGps}>ใช้ตำแหน่งปัจจุบันแทน</button></>
            ) : gpsStatus === 'unavailable' ? (
              <span>อุปกรณ์นี้ระบุตำแหน่งไม่ได้ — กรุณาตั้งค่าจังหวัดในโปรไฟล์</span>
            ) : (
              <button type="button" className="aq-retry" onClick={requestGps}>ใช้ตำแหน่งปัจจุบันแทน</button>
            )}
          </div></section>
        )}

        {provinceState === 'ready' && error && (
          <section className="aq-card"><div className="aq-empty-state" role="alert">
            <strong>ดึงข้อมูลไม่สำเร็จ</strong><span>{error}</span>
            <button type="button" className="aq-retry" onClick={retry}>ลองอีกครั้ง</button>
          </div></section>
        )}

        {provinceState === 'ready' && !error && data && data.state !== 'success' && data.state !== 'partial' && (
          <section className="aq-card"><div className="aq-empty-state">
            <strong>{data.state === 'no_station_nearby' ? `ไม่พบสถานีวัดฝุ่นในจังหวัด${province || 'ที่เลือก'}` : data.state === 'invalid_coordinates' ? 'พิกัดไม่ถูกต้อง' : 'ยังไม่มีข้อมูลรายชั่วโมง'}</strong>
            <span>{data.message}</span>
            <button type="button" className="aq-retry" onClick={retry}>ลองอีกครั้ง</button>
          </div></section>
        )}

        {provinceState === 'ready' && !error && data && (data.state === 'success' || data.state === 'partial') && (
          <>
            {data.stale && (
              <section className="aq-card hf-stale" role="status">⏳ {data.note}</section>
            )}
            <section className="aq-card">
              <div className="hf-station">
                <span className="aq-badge aq-badge-real">ข้อมูลจริง</span>
              </div>
              <div className="hf-current">
                <span className="hf-value">{data.observed?.pm25}</span>
                <span className="hf-unit">µg/m³</span>
                <span className="hf-when">วัดเมื่อ {data.observed?.timeLocal} น. · {data.observed?.status?.level}</span>
              </div>
              <p className="hf-advice">{data.observed?.status?.advice}</p>
              {mode === 'gps' && (
                <button type="button" className="aq-retry" onClick={backToProfileProvince}>กลับไปใช้จังหวัดในโปรไฟล์{province ? ` (${province})` : ''}</button>
              )}
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
