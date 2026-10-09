import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProvinceCoords } from '../data/provinceCoords'

// ตรรกะร่วมของหน้าค่าฝุ่นล่วงหน้า (/air-quality-trend, /hourly-forecast):
// 1) จังหวัดจาก profiles.province ของผู้ใช้ที่ล็อกอิน = ค่าหลัก (ตรงกับการ personalize ฝุ่นทั้งระบบ)
// 2) ยังไม่ได้ตั้งจังหวัด (province ว่าง/NULL) → provinceState = 'no-province'
//    หน้าต้องแจ้งเตือนให้ไปตั้งค่าที่ /profile — ห้าม fallback ไป geolocation เงียบ ๆ
// 3) navigator.geolocation เป็นตัวเลือกเสริมเท่านั้น: ขอสิทธิ์เมื่อผู้ใช้กด "ใช้ตำแหน่งปัจจุบันแทน" เอง
export function useProvinceAirLocation() {
  const [provinceState, setProvinceState] = useState('loading') // loading | ready | no-province
  const [province, setProvince] = useState('')
  const [coords, setCoords] = useState(null) // { latitude, longitude } — anchor ให้ API หาสถานี
  const [mode, setMode] = useState('province') // province | gps (ตัวเลือกเสริม)
  const [gpsStatus, setGpsStatus] = useState('idle') // idle | asking | granted | denied | unavailable
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) {
        if (active) setProvinceState('no-province')
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (active) setProvinceState('no-province')
        return
      }
      const { data: profile } = await supabase.from('profiles').select('province').eq('id', user.id).maybeSingle()
      if (!active) return
      const saved = profile?.province || ''
      setProvince(saved)
      const anchor = getProvinceCoords(saved)
      if (saved && anchor) {
        setCoords(anchor)
        setMode('province')
        setProvinceState('ready')
      } else {
        // ไม่เคยตั้งจังหวัด หรือจังหวัดที่บันทึกไว้ไม่มีพิกัดอ้างอิง → แจ้งเตือน ไม่เดาพิกัดเอง
        setProvinceState('no-province')
      }
    }
    load()
    return () => { active = false }
  }, [attempt])

  // ตัวเลือกเสริม: ใช้ GPS ของเครื่องแทน (ผู้ใช้กดเองเท่านั้น)
  const requestGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable')
      return
    }
    setGpsStatus('asking')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setMode('gps')
        setGpsStatus('granted')
        setProvinceState('ready')
      },
      () => setGpsStatus('denied'),
      { timeout: 10000, maximumAge: 600000 },
    )
  }, [])

  // กลับจาก GPS → ใช้จังหวัดในโปรไฟล์ตามเดิม
  const backToProfileProvince = useCallback(() => {
    const anchor = getProvinceCoords(province)
    setGpsStatus('idle')
    setMode('province')
    if (anchor) {
      setCoords(anchor)
      setProvinceState('ready')
    } else {
      setProvinceState('no-province')
    }
  }, [province])

  const reloadProvince = useCallback(() => setAttempt((value) => value + 1), [])

  return { provinceState, province, coords, mode, gpsStatus, requestGps, backToProfileProvince, reloadProvince }
}
