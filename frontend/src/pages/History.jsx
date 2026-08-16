import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const riskLevels = [
  { max: 2, label: 'ความเสี่ยงต่ำ', className: 'risk-very-low' },
  { max: 4, label: 'ความเสี่ยงต่ำ', className: 'risk-low' },
  { max: 9, label: 'ความเสี่ยงปานกลาง', className: 'risk-moderate' },
  { max: 15, label: 'ความเสี่ยงสูง', className: 'risk-high' },
  { max: Infinity, label: 'ความเสี่ยงสูง', className: 'risk-very-high' },
]

function getRiskLevel(score) { return riskLevels.find((level) => score <= level.max) || riskLevels[0] }

export default function History() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('กำลังโหลดประวัติการประเมิน...')

  useEffect(() => {
    async function load() {
      if (!supabase) { setStatus('ไม่พบการเชื่อมต่อฐานข้อมูล'); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStatus('กรุณาเข้าสู่ระบบ'); return }
      const { data, error } = await supabase.from('risk_assessments').select('id, score, risk_level, created_at').eq('user_id', user.id).order('created_at', { ascending: false })
      if (error) { setStatus('ไม่สามารถโหลดประวัติการประเมินได้'); return }
      setItems(data || [])
      setStatus(data?.length ? '' : 'ยังไม่มีประวัติการประเมิน')
    }
    load()
  }, [])

  return <main className="profile-page"><section className="profile-card history-card"><Link to="/" className="profile-back">← กลับหน้าหลัก</Link><h1>ประวัติการประเมิน</h1><p>ผลการประเมินความเสี่ยงโรคทางเดินหายใจของคุณ</p>{status && <p className="profile-status" role={status.includes('ไม่สามารถ') || status.includes('ไม่พบ') ? 'alert' : 'status'}>{status}</p>}<div className="history-list">{items.map((item) => { const score = Number(item.score) || 0; const risk = getRiskLevel(score); return <article key={item.id}><div className="history-row"><strong className={`risk-badge ${risk.className}`}>{risk.label}</strong></div><small>ประเมินเมื่อ {new Date(item.created_at).toLocaleString('th-TH')}</small></article> })}</div></section></main>
}
