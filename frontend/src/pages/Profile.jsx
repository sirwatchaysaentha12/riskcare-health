import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { UNIQUE_THAI_PROVINCES } from '../data/thaiProvinces'

export default function Profile() {
  const [form, setForm] = useState({ full_name: '', province: '' })
  const [status, setStatus] = useState('')

  useEffect(() => {
    async function load() {
      if (!supabase) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('full_name, province').eq('id', user.id).maybeSingle()
      if (data) setForm({ full_name: data.full_name || '', province: data.province || '' })
    }
    load()
  }, [])

  async function save(event) {
    event.preventDefault()
    if (!supabase) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update(form).eq('id', user.id)
    setStatus(error ? 'ไม่สามารถบันทึกข้อมูลได้' : 'บันทึกข้อมูลเรียบร้อยแล้ว')
  }

  return <main className="profile-page"><section className="profile-card"><Link to="/" className="profile-back">← กลับหน้าหลัก</Link><h1>ข้อมูลส่วนตัว</h1><p>แก้ไขข้อมูลสำหรับใช้ปรับคำแนะนำความเสี่ยงให้เหมาะกับคุณ</p><form onSubmit={save}><label>ชื่อ-นามสกุล<input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label><label>จังหวัดที่อยู่ปัจจุบัน<select value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })}><option value="">เลือกจังหวัด</option>{UNIQUE_THAI_PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}</select></label><button className="profile-save" type="submit">บันทึกข้อมูล</button>{status && <p className="profile-status" role="status">{status}</p>}</form></section></main>
}
