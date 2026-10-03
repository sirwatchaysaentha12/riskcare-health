import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import RrCameraCapture from '../components/RrCameraCapture'
import { analyzeVitalSigns, extractNumericVitals } from '../services/vitalSigns'
import { computeRespiratoryRisk, RISK_DISCLAIMER } from '../utils/respiratoryRiskScore'

// หน้าประเมินความเสี่ยงโรคทางเดินหายใจ รวม 3 สัญญาณเข้าด้วยกัน (rule-based weighted scoring):
//   1. อัตราการหายใจ (RR) จาก MediaPipe Pose (คอมโพเนนต์ RrCameraCapture)
//   2. HR/SpO2 โดยประมาณจาก vitallens rPPG ผ่าน backend /api/vital-signs
//   3. คะแนนแบบประเมินอาการเดิม (risk_assessments — ใช้เกณฑ์ 5/10/16 + red flag เดิมของ Assessment.jsx)
// คัดกรองเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์
// ทุกสัญญาณขาดได้ — ไม่มีกล้องก็ยังประเมินจากแบบประเมินอย่างเดียวได้ และหน้านี้จะแจ้งเสมอว่าใช้/ขาดสัญญาณไหน

const CATEGORY_LABELS = {
  normal: 'ปกติ',
  watch: 'เฝ้าระวัง',
  abnormal: 'ผิดปกติ',
  critical: 'วิกฤต',
  unavailable: 'ไม่มีข้อมูล',
}

const MISSING_SIGNAL_LABELS = {
  rr: 'อัตราการหายใจ (RR จากกล้อง)',
  spo2: 'ออกซิเจนในเลือด (SpO2)',
  hr: 'อัตราการเต้นหัวใจ (HR)',
  questionnaire: 'แบบประเมินอาการ',
}

export default function RespiratoryRiskAssessment() {
  const [rr, setRr] = useState(null) // { bpm, reliable, sampleCount }
  const [vitals, setVitals] = useState(null) // { hrBpm, spo2Percent, rrFromVitals, hrConfidence }
  const [vitalsStatus, setVitalsStatus] = useState('idle') // idle | loading | ok | failed
  const [vitalsMessage, setVitalsMessage] = useState(null)
  const [questionnaire, setQuestionnaire] = useState(null) // { score, redFlag, exists }
  const [questionnaireLoading, setQuestionnaireLoading] = useState(true)

  // สัญญาณที่ 3 — ดึงผลแบบประเมินเดิมล่าสุดของผู้ใช้จาก Supabase (ตาราง risk_assessments)
  useEffect(() => {
    let cancelled = false
    async function loadLatestAssessment() {
      if (!supabase) {
        if (!cancelled) setQuestionnaire({ exists: false })
        setQuestionnaireLoading(false)
        return
      }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (!cancelled) setQuestionnaire({ exists: false })
          setQuestionnaireLoading(false)
          return
        }
        const { data, error } = await supabase
          .from('risk_assessments')
          .select('score, red_flag, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (!cancelled) {
          if (error) throw error
          const latest = data?.[0]
          setQuestionnaire(
            latest
              ? { score: latest.score ?? 0, redFlag: latest.red_flag === true, exists: true, createdAt: latest.created_at }
              : { exists: false },
          )
        }
      } catch {
        if (!cancelled) setQuestionnaire({ exists: false })
      } finally {
        if (!cancelled) setQuestionnaireLoading(false)
      }
    }
    loadLatestAssessment()
    return () => { cancelled = true }
  }, [])

  const handleRrResult = useCallback((result) => {
    setRr(result)
  }, [])

  const handleVideoRecorded = useCallback(async (blob) => {
    if (!blob) {
      setVitalsStatus('failed')
      setVitalsMessage('ไม่ได้รับคลิปวิดีโอจากกล้อง — ข้ามสัญญาณ vitallens (HR/SpO2)')
      return
    }
    setVitalsStatus('loading')
    setVitalsMessage(null)
    const result = await analyzeVitalSigns(blob)
    const numeric = extractNumericVitals(result)
    if (result.ok && numeric.hrBpm !== null) {
      setVitals(numeric)
      setVitalsStatus('ok')
    } else {
      setVitals(null)
      setVitalsStatus('failed')
      setVitalsMessage(`vitallens ประมวลผลไม่สำเร็จ (${result.error || 'ไม่ทราบสาเหตุ'}) — ใช้ MediaPipe RR + แบบประเมินอาการแทน`)
    }
  }, [])

  const handleUploadVideo = useCallback(async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await handleVideoRecorded(file)
  }, [handleVideoRecorded])

  const riskResult = useMemo(
    () => computeRespiratoryRisk({
      rrFromCamera: rr?.bpm ?? null,
      spo2Percent: vitals?.spo2Percent ?? null,
      hrBpm: vitals?.hrBpm ?? null,
      questionnaire,
    }),
    [rr, vitals, questionnaire],
  )

  const hasVideoSignal = rr !== null || vitals !== null
  const vitalsLoading = vitalsStatus === 'loading'

  return (
    <main className="rrisk-page">
      <header className="rrisk-header">
        <Link to="/overview" className="rrisk-back-link">กลับหน้าภาพรวม</Link>
        <h1>ประเมินความเสี่ยงโรคทางเดินหายใจ</h1>
        <p className="rrisk-subtitle">
          รวม 3 สัญญาณ: อัตราการหายใจจากกล้อง (MediaPipe Pose) + ชีพจร/ออกซิเจนจากใบหน้า (vitallens rPPG) + แบบประเมินอาการ
        </p>
        <p className="rrisk-disclaimer">{RISK_DISCLAIMER}</p>
      </header>

      <section className="rrisk-section">
        <h2>สัญญาณที่ 1 · อัตราการหายใจ (RR) — กล้อง</h2>
        <p>นั่งพักนิ่ง ๆ หน้ากล้องให้เห็นไหล่ทั้งสองข้าง แล้วหายใจตามปกติ 30 วินาที</p>
        <RrCameraCapture onRrResult={handleRrResult} onVideoRecorded={handleVideoRecorded} />
        {rr && (
          <p className={rr.reliable ? 'rrisk-signal-ok' : 'rrisk-signal-warn'}>
            {rr.reliable
              ? `วัดได้ RR ${Math.round(rr.bpm)} ครั้ง/นาที (จาก ${rr.sampleCount} จุดตัวอย่าง)`
              : 'การวัดไม่น่าเชื่อถือ (สัญญาณไม่สม่ำเสมอ) — ลองวัดใหม่ หรือใช้สัญญาณอื่นแทน'}
          </p>
        )}
      </section>

      <section className="rrisk-section">
        <h2>สัญญาณที่ 2 · ชีพจร/ออกซิเจน — vitallens rPPG</h2>
        <p>
          ประมวลผลคลิปใบหน้าจากกล้ามเนื้อผิวหนัง (rPPG) โดยประมาณ — ต้องการแสงสว่างเพียงพอ เพื่อความแม่นยำ
          โหมด local (POS) ให้ค่า HR ส่วน SpO2 อาจไม่มีในบางโหมด
        </p>
        {vitalsLoading && <p className="rrisk-signal-warn" role="status">กำลังประมวลผลวิดีโอด้วย vitallens… (ประมาณ 10-60 วินาที)</p>}
        {vitalsStatus === 'ok' && vitals && (
          <p className="rrisk-signal-ok">
            vitallens: HR {vitals.hrBpm !== null ? `${Math.round(vitals.hrBpm)} bpm` : 'ไม่มี'}
            {vitals.hrConfidence !== null && ` (ความมั่นใจ ${(vitals.hrConfidence * 100).toFixed(0)}%)`}
            {vitals.spo2Percent !== null && ` · SpO2 ${vitals.spo2Percent}%`}
            {vitals.spo2Percent === null && ' · SpO2 ไม่พร้อมใช้ในโหมด local'}
          </p>
        )}
        {vitalsStatus === 'failed' && <p className="rrisk-signal-warn">⚠️ {vitalsMessage}</p>}
        <label className="rrisk-upload">
          หรืออัปโหลดคลิปใบหน้า (webm/mp4 ไม่เกิน 60MB)
          <input type="file" accept="video/webm,video/mp4,video/*" onChange={handleUploadVideo} disabled={vitalsLoading} />
        </label>
      </section>

      <section className="rrisk-section">
        <h2>สัญญาณที่ 3 · แบบประเมินอาการ (Self-Observation)</h2>
        {questionnaireLoading && <p role="status">กำลังโหลดผลแบบประเมินเดิม…</p>}
        {!questionnaireLoading && questionnaire?.exists && (
          <p className="rrisk-signal-ok">
            ผลล่าสุด: คะแนน {questionnaire.score}/31{questionnaire.redFlag ? ' (มีอาการเร่งด่วน red flag)' : ''}
            {' '}— ใช้เกณฑ์เดิมจากหน้าแบบประเมิน (≥5 ปานกลาง, ≥10 สูง, ≥16 สูงมาก)
          </p>
        )}
        {!questionnaireLoading && !questionnaire?.exists && (
          <p className="rrisk-signal-warn">
            ยังไม่มีผลแบบประเมินอาการ — <Link to="/assessment">ไปทำแบบประเมินเดิม</Link> (หรือกดสรุปผลด้านล่างโดยไม่ใช้สัญญาณนี้)
          </p>
        )}
      </section>

      <section className="rrisk-section rrisk-result" aria-live="polite">
        <h2>ผลรวมการประเมิน</h2>
        {!questionnaireLoading ? (
          <>
            <div className={`rrisk-total rrisk-total--${riskResult.tone}`}>
              <div className="rrisk-total-score">
                <b>{riskResult.totalScore}</b><span>คะแนนความเสี่ยง</span>
              </div>
              <div className="rrisk-total-level">
                <strong>{riskResult.levelLabel}</strong>
                <p>{riskResult.levelDescription}</p>
              </div>
            </div>
            {riskResult.critical && (
              <div className="rrisk-critical" role="alert">
                🚨 {riskResult.criticalReason} — ติดต่อแพทย์หรือ 1669 ทันที
              </div>
            )}
            <ul className="rrisk-signal-list">
              {riskResult.signals.map((signal) => (
                <li key={signal.key} className={`rrisk-signal rrisk-signal--${signal.category}`}>
                  <div className="rrisk-signal-head">
                    <strong>{signal.label}</strong>
                    <span className={`rrisk-badge rrisk-badge--${signal.category}`}>{CATEGORY_LABELS[signal.category]}</span>
                    <span className="rrisk-signal-points">{signal.points} คะแนน</span>
                  </div>
                  <p>{signal.detail}</p>
                </li>
              ))}
            </ul>
            <div className="rrisk-coverage">
              <p>
                สัญญาณที่ใช้ในการประเมินครั้งนี้: {riskResult.usedSignalKeys.length > 0
                  ? riskResult.usedSignalKeys.map((key) => MISSING_SIGNAL_LABELS[key]).join(' · ')
                  : 'ไม่มี'}
              </p>
              {riskResult.missingSignalKeys.length > 0 && (
                <p className="rrisk-coverage-missing">
                  สัญญาณที่ขาดไป: {riskResult.missingSignalKeys.map((key) => MISSING_SIGNAL_LABELS[key]).join(' · ')}
                </p>
              )}
            </div>
            <p className="rrisk-disclaimer">{RISK_DISCLAIMER}</p>
          </>
        ) : (
          <p role="status">กำลังรวบรวมสัญญาณ…</p>
        )}
      </section>
    </main>
  )
}
