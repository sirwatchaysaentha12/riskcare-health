import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import RrCameraCapture from '../components/RrCameraCapture'
import CameraConsent from '../components/CameraConsent'
import { analyzeVitalSigns, extractNumericVitals } from '../services/vitalSigns'
import { computeRespiratoryRisk, RISK_DISCLAIMER } from '../utils/respiratoryRiskScore'
import { assessHrQuality, CLINICAL_ACCURACY_STATUS, QUALITY_STATUS } from '../utils/signalQuality'
import {
  createSignalMeasurement,
  createSpo2LocalMeasurement,
  buildClinicianSummary,
  pseudonymizeUserCode,
  QUALITY_DISPLAY,
  CONTRACT_QUALITY_STATUS,
} from '../utils/measurementContract'

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

const QUALITY_STATUS_LABELS = {
  good: 'คุณภาพดี',
  acceptable: 'คุณภาพพอใช้ (มีข้อควรระวัง)',
  insufficient: 'คุณภาพไม่พอ — ค่าการวัดไม่ถูกใช้',
}

const CHECK_LABELS = {
  duration: 'ระยะเวลาวัด',
  poseVisibility: 'ไหล่อยู่ในเฟรม',
  brightness: 'แสง',
  blur: 'ความคมชัด (เบลอ)',
  fps: 'อัตราเฟรม',
  droppedFrames: 'เฟรมหลุด',
  motion: 'การขยับตัว/พูด/ไอ',
  periodicity: 'ความเป็นคาบของสัญญาณหายใจ',
  intervalCv: 'ความสม่ำเสมอของจังหวะ (CV)',
}

const CHECK_STATUS_LABELS = {
  pass: 'ผ่าน',
  warn: 'เฝ้าระวัง',
  fail: 'ไม่ผ่าน',
  not_run: 'ไม่ได้ตรวจ',
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
  const [anonCode, setAnonCode] = useState('UNKNOWN')
  // Phase 5 — Consent: ต้องยอมรับก่อนเปิดกล้อง; research consent ไม่ติ๊กไว้ล่วงหน้า
  const [consent, setConsent] = useState({ camera: false, limitations: false, research: false })
  const [cancelNote, setCancelNote] = useState(null)
  const consentReady = consent.camera && consent.limitations

  // รหัสผู้ใช้แบบไม่เปิดเผยตัวตน สำหรับรายงานแพทย์ (SHA-256 สั้น ๆ ของ user id — ไม่ย้อนกลับได้)
  useEffect(() => {
    let cancelled = false
    loadPseudonymousCode()
    async function loadPseudonymousCode() {
      try {
        if (!supabase) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return
        const code = await pseudonymizeUserCode(user.id)
        if (!cancelled) setAnonCode(code)
      } catch { /* ใช้ UNKNOWN ได้ */ }
    }
    return () => { cancelled = true }
  }, [])

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
    setRr({ ...result, measuredAt: new Date().toISOString() })
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
      // Phase 2 — Algorithm Confidence ต่ำ = ใช้ค่าไม่ได้ (ไม่ป้อน scoring) ไม่ใช่ clinical accuracy
      const hrQuality = assessHrQuality(numeric.hrBpm, numeric.hrConfidence)
      if (!hrQuality.usable) {
        setVitals(null)
        setVitalsStatus('failed')
        setVitalsMessage(hrQuality.missingReason)
        return
      }
      setVitals({ ...numeric, hrQuality, measuredAt: new Date().toISOString() })
      setVitalsStatus('ok')
    } else {
      setVitals(null)
      setVitalsStatus('failed')
      setVitalsMessage(`vitallens ประมวลผลไม่สำเร็จ (${result.error || 'ไม่ทราบสาเหตุ'}) — ใช้ MediaPipe RR + แบบประเมินอาการแทน`)
    }
  }, [])

  const handleUploadVideo = useCallback(async (event) => {
    // Phase 5/6 — การอัปโหลดวิดีโอส่งเนื้อไฟล์ให้ backend เหมือนการวัดด้วยกล้อง จึงต้องมี Consent ก่อนเช่นกัน
    if (!consentReady) {
      setCancelNote('ต้องให้ความยินยอมด้านบน (ยินยอมกล้อง + รับทราบข้อจำกัด) ก่อนอัปโหลดวิดีโอ')
      return
    }
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await handleVideoRecorded(file)
  }, [consentReady, handleVideoRecorded])

  // Phase 2 — ค่า RR ที่ "คุณภาพไม่ผ่าน" จะไม่ถูกนำไปเข้า scoring เป็นค่าปกติ (ถือเป็น missing)
  const usableRr = rr && rr.quality?.canUseMeasurement && Number.isFinite(rr.bpm) ? rr.bpm : null
  const rrQualityBlocked = rr && rr.quality && !rr.quality.canUseMeasurement

  const riskResult = useMemo(
    () => computeRespiratoryRisk({
      rrFromCamera: usableRr,
      spo2Percent: vitals?.spo2Percent ?? null,
      hrBpm: vitals?.hrBpm ?? null,
      questionnaire,
    }),
    [usableRr, vitals, questionnaire],
  )

  // Phase 3 — Unified Measurement Contract: metadata มาตรฐานเดียวของทุกสัญญาณ
  const measurementContracts = useMemo(() => {
    const rrMissing = rr
      ? rrQualityBlocked
        ? rr.quality.missingReason
        : 'ค่า RR ที่ประมาณได้ไม่ผ่านเกณฑ์ความน่าเชื่อถือ จึงไม่ถูกใช้'
      : 'ยังไม่ได้วัดจากกล้อง (กล้องใช้ไม่ได้ก็ประเมินได้จากสัญญาณอื่น)'
    const hrMissing = vitals
      ? null
      : (vitalsStatus === 'failed' && vitalsMessage ? vitalsMessage : 'ยังไม่มีการวัด HR จาก vitallens')
    const rrContract = createSignalMeasurement({
      key: 'rr',
      label: 'อัตราการหายใจ (RR)',
      unit: 'ครั้ง/นาที',
      value: usableRr,
      usable: usableRr != null,
      source: 'กล้อง (MediaPipe Pose — ประมวลผลในเครื่องผู้ใช้)',
      measuredAt: rr?.measuredAt ?? null,
      durationSeconds: rr?.elapsedMs ? Math.round(rr.elapsedMs / 1000) : null,
      qualityStatus: rr?.quality?.qualityStatus ?? CONTRACT_QUALITY_STATUS.NOT_ASSESSED,
      qualityReasons: rr?.quality?.qualityReasons ?? [],
      missingReason: rrMissing,
    })
    const hrContract = createSignalMeasurement({
      key: 'hr',
      label: 'อัตราการเต้นหัวใจ (HR)',
      unit: 'bpm',
      value: vitals?.hrBpm ?? null,
      usable: Number.isFinite(vitals?.hrBpm),
      source: 'VitalLens POS rPPG จากใบหน้า (ประมวลผลในเครื่อง server ท้องถิ่น — ไม่ส่งออกอินเทอร์เน็ต)',
      measuredAt: vitals?.measuredAt ?? null,
      durationSeconds: rr?.elapsedMs ? Math.round(rr.elapsedMs / 1000) : null,
      qualityStatus: vitals
        ? (vitals.hrQuality?.level === 'low_confidence_warning' ? QUALITY_STATUS.ACCEPTABLE : QUALITY_STATUS.GOOD)
        : CONTRACT_QUALITY_STATUS.NOT_ASSESSED,
      qualityReasons: vitals?.hrQuality?.level === 'low_confidence_warning' ? ['hrConfidence:warn'] : [],
      algorithmConfidence: vitals?.hrConfidence ?? null,
      missingReason: hrMissing,
    })
    const spo2Contract = createSpo2LocalMeasurement()
    const questionnaireContract = createSignalMeasurement({
      key: 'questionnaire',
      label: 'แบบประเมินอาการ (Self-Observation)',
      unit: 'คะแนน (0-31)',
      value: questionnaire?.exists ? questionnaire.score : null,
      usable: Boolean(questionnaire?.exists),
      source: 'แบบประเมินอาการเดิม (Supabase risk_assessments — ผลล่าสุดของผู้ใช้)',
      measuredAt: questionnaire?.createdAt ?? null,
      durationSeconds: null,
      qualityStatus: CONTRACT_QUALITY_STATUS.NOT_ASSESSED,
      missingReason: questionnaire?.exists ? null : 'ยังไม่มีผลแบบประเมินอาการ — สามารถไปทำแบบประเมินเดิมได้ที่หน้า /assessment',
    })
    return [rrContract, hrContract, spo2Contract, questionnaireContract]
  }, [rr, usableRr, rrQualityBlocked, vitals, vitalsStatus, vitalsMessage, questionnaire])

  const clinicianSummary = useMemo(
    () => buildClinicianSummary({ signals: measurementContracts, scoring: riskResult, anonCode }),
    [measurementContracts, riskResult, anonCode],
  )

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
        <CameraConsent consent={consent} onConsentChange={setConsent} />
        <RrCameraCapture
          onRrResult={handleRrResult}
          onVideoRecorded={handleVideoRecorded}
          onCancel={setCancelNote}
          enabled={consentReady}
        />
        {cancelNote && <p className="rrisk-signal-warn" role="status">{cancelNote}</p>}
        {rr && (
          <div className="rrisk-rr-outcome">
            <p className={`rrisk-signal-${rr.quality?.canUseMeasurement && rr.reliable ? 'ok' : 'warn'}`} role="status">
              {rr.quality?.canUseMeasurement && rr.reliable
                ? `วัดได้ RR ${Math.round(rr.bpm)} ครั้ง/นาที (จาก ${rr.sampleCount} จุดตัวอย่าง, ${Math.round(rr.elapsedMs / 1000)} วินาที)`
                : rr.rawBpm != null
                  ? `ค่าดิบที่ประมาณได้ ${Math.round(rr.rawBpm)} ครั้ง/นาที แต่ไม่ถูกนำไปใช้เพราะคุณภาพไม่ผ่านเกณฑ์`
                  : 'ประมาณค่า RR ไม่สำเร็จ — ค่านี้จะไม่ถูกนำไปใช้'}
            </p>
            {rr.quality && (
              <div className={`rrisk-quality rrisk-quality--${rr.quality.qualityStatus}`}>
                <p className="rrisk-quality-title">
                  Quality Gate: {QUALITY_STATUS_LABELS[rr.quality.qualityStatus]}
                  {rr.quality.qualityStatus === QUALITY_STATUS.INSUFFICIENT && rr.quality.missingReason ? ` — ${rr.quality.missingReason}` : ''}
                </p>
                <ul className="rrisk-checks">
                  {rr.quality.checks.map((item) => (
                    <li key={item.id} className={`rrisk-check rrisk-check--${item.status}`}>
                      <span>{CHECK_LABELS[item.id] || item.id}</span>
                      <b>{CHECK_STATUS_LABELS[item.status]}</b>
                      <small>{item.detail}</small>
                    </li>
                  ))}
                </ul>
                {rr.quality.retryGuidance && <p className="rrisk-retry">{rr.quality.retryGuidance}</p>}
              </div>
            )}
          </div>
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
          <div>
            <p className="rrisk-signal-ok">
              vitallens (ประมวลผลในเครื่อง): HR {vitals.hrBpm !== null ? `${Math.round(vitals.hrBpm)} bpm` : 'ไม่มี'}
              {vitals.hrQuality && ` · Algorithm Confidence: ${vitals.hrQuality.confidence?.toFixed(2)} — ตัวชี้วัดภายในอัลกอริทึม ไม่ใช่ความแม่นยำทางคลินิก`}
              {vitals.hrQuality?.level === 'low_confidence_warning' && ' · ความมั่นใจต่ำ ควรตีความด้วยความระมัดระวัง'}
            </p>
            <p className="rrisk-signal-warn">SpO2: ไม่มีข้อมูล — โหมด local ของ vitallens ไม่ประเมิน SpO2 และระบบจะไม่สร้างค่าแทน หากมีเครื่องวัดออกซิเจนแบบคลิปนิ้ว (Pulse Oximeter) ให้ใช้ค่าจากอุปกรณ์นั้นเป็นข้อมูลประกอบ</p>
          </div>
        )}
        {vitalsStatus === 'failed' && <p className="rrisk-signal-warn">⚠️ {vitalsMessage}</p>}
        <label className={`rrisk-upload ${consentReady ? '' : 'rrisk-upload--locked'}`}>
          หรืออัปโหลดคลิปใบหน้า (webm/mp4 ไม่เกิน 60MB){!consentReady && ' — ต้องให้ความยินยอมด้านบนก่อน'}
          <input
            type="file"
            accept="video/webm,video/mp4,video/*"
            onChange={handleUploadVideo}
            disabled={vitalsLoading || !consentReady}
          />
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
              {measurementContracts.map((contract) => {
                const rulePoints = riskResult.signals.find((signal) => signal.key === contract.key)
                return (
                  <li key={contract.key} className={`rrisk-signal rrisk-signal--${rulePoints?.category ?? 'unavailable'}`}>
                    {/* ชั้นที่ 1: ค่าที่วัดได้และหน่วย */}
                    <div className="rrisk-signal-head">
                      <strong>{contract.label}</strong>
                      <span className={`rrisk-badge rrisk-badge--${rulePoints?.category ?? 'unavailable'}`}>{CATEGORY_LABELS[rulePoints?.category ?? 'unavailable']}</span>
                      <span className="rrisk-signal-points">{rulePoints ? `${rulePoints.points} คะแนน` : ''}</span>
                    </div>
                    <p className="rrisk-layer1-value">
                      {contract.usable
                        ? <b>{Number.isInteger(contract.value) ? contract.value : Number(contract.value).toFixed(1)} <small>{contract.unit}</small></b>
                        : <b className="rrisk-missing-value">ไม่มีข้อมูล</b>}
                    </p>
                    {!contract.usable && <p className="rrisk-missing-reason" role="status">เหตุผล: {contract.missingReason}</p>}
                    {/* ชั้นที่ 2: คุณภาพสัญญาณและเหตุผล */}
                    <p className={`rrisk-layer2 rrisk-qualitytext--${contract.qualityStatus}`}>
                      คุณภาพสัญญาณ: {QUALITY_DISPLAY[contract.qualityStatus]}
                      {contract.qualityReasons.length > 0 && ` (${contract.qualityReasons.join(', ')})`}
                    </p>
                    {/* ชั้นที่ 3: แหล่งข้อมูล, Algorithm, เวลา */}
                    <details className="rrisk-layer3">
                      <summary>ที่มาของค่า (แหล่งข้อมูล/อัลกอริทึม/เวลา)</summary>
                      <p>แหล่งข้อมูล: {contract.source}</p>
                      <p>อัลกอริทึม: {contract.algorithm.name}</p>
                      <p>เวอร์ชัน: {contract.algorithm.version}</p>
                      <p>โมเดล: {contract.algorithm.model}</p>
                      <p>เวลาที่วัด: {contract.measuredAt ? new Date(contract.measuredAt).toLocaleString('th-TH') : '—'}</p>
                      <p>ระยะเวลาวัด: {contract.durationSeconds != null ? `${contract.durationSeconds} วินาที` : '—'}</p>
                      {contract.algorithmConfidence != null && (
                        <p>Algorithm Confidence: {contract.algorithmConfidence.toFixed(2)} — ตัวชี้วัดภายในอัลกอริทึม <b>ไม่ใช่</b> Clinical Accuracy</p>
                      )}
                    </details>
                    {/* ชั้นที่ 4: สถานะคลินิก + ข้อจำกัด */}
                    <details className="rrisk-layer4">
                      <summary>สถานะความถูกต้องทางคลินิกและข้อจำกัด</summary>
                      <p className="rrisk-clinical">{contract.clinicalAccuracyLabel}</p>
                      <ul>
                        {contract.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
                      </ul>
                    </details>
                  </li>
                )
              })}
            </ul>
            <div className="rrisk-coverage">
              <p>
                สัญญาณที่ใช้ในการประเมินครั้งนี้: {riskResult.usedSignalKeys.length > 0
                  ? riskResult.usedSignalKeys.map((key) => MISSING_SIGNAL_LABELS[key]).join(' · ')
                  : 'ไม่มี'}
              </p>
              {rrQualityBlocked && (
                <p className="rrisk-coverage-missing">อัตราการหายใจ (RR): {rr.quality.missingReason}</p>
              )}
              {riskResult.missingSignalKeys.length > 0 && (
                <p className="rrisk-coverage-missing">
                  สัญญาณที่ขาดไป: {riskResult.missingSignalKeys.map((key) => MISSING_SIGNAL_LABELS[key]).join(' · ')}
                </p>
              )}
              <p className="rrisk-accuracy">{CLINICAL_ACCURACY_STATUS}</p>
            </div>
            {/* รายงานสำหรับบุคลากรทางการแพทย์ (ไม่รวมวิดีโอ/ข้อมูลระบุตัวตน) */}
            <div className="rrisk-clinician" id="clinician-summary" role="region" aria-label="รายงานสรุปสำหรับบุคลากรทางการแพทย์">
              <div className="rrisk-clinician-head">
                <h3> Clinician Review Summary — รายงานสำหรับบุคลากรทางการแพทย์</h3>
                <button type="button" className="rrisk-btn rrisk-btn--small" onClick={() => window.print()}>พิมพ์รายงาน</button>
              </div>
              <p>วันเวลารายงาน: {new Date(clinicianSummary.generatedAt).toLocaleString('th-TH')} · รหัสอ้างอิงผู้ใช้ (Pseudonymous ID — รหัสเทียม): <b>{clinicianSummary.anonCode}</b></p>
              <table className="rrisk-clinician-table">
                <thead>
                  <tr><th>สัญญาณ</th><th>ค่า</th><th>แหล่งที่มา</th><th>คุณภาพ</th><th>ใช้ได้</th><th>เหตุผลที่ขาด (ถ้ามี)</th><th>คะแนนตามกฎ</th></tr>
                </thead>
                <tbody>
                  {measurementContracts.map((contract) => {
                    const rulePoints = riskResult.signals.find((signal) => signal.key === contract.key)
                    return (
                      <tr key={contract.key}>
                        <td>{contract.label}</td>
                        <td>{contract.usable ? `${contract.value} ${contract.unit}` : 'null (ไม่มีข้อมูล)'}</td>
                        <td>{contract.source}</td>
                        <td>{QUALITY_DISPLAY[contract.qualityStatus]}</td>
                        <td>{contract.usable ? 'ใช้ได้' : 'ไม่ใช้'}</td>
                        <td>{contract.missingReason ?? '—'}</td>
                        <td>{rulePoints ? `${rulePoints.points} (${rulePoints.category})` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p>ผลรวมตามกฎ: <b>{riskResult.totalScore}</b> คะแนน → <b>{riskResult.levelLabel}</b>{riskResult.critical ? ` (${riskResult.criticalReason})` : ''}</p>
              <p>ระยะเวลาวัด: {measurementContracts.filter((contract) => contract.durationSeconds != null).map((contract) => `${contract.label} ${contract.durationSeconds} วิ`).join(' · ') || '—'}</p>
              <details>
                <summary>ข้อจำกัดของแต่ละสัญญาณ</summary>
                <ul>
                  {[...new Set(clinicianSummary.limitations)].map((limitation, index) => <li key={index}>{limitation}</li>)}
                </ul>
              </details>
              <p className="rrisk-clinician-disclaimer">{clinicianSummary.disclaimer}</p>
              <p className="rrisk-clinician-policy">{clinicianSummary.dataPolicy}</p>
            </div>
            <p className="rrisk-disclaimer">
              {RISK_DISCLAIMER} ค่าทั้งหมดเป็นค่าประมาณจากกล้อง ไม่ใช่ค่าจากอุปกรณ์การแพทย์ หากมีอาการผิดปกติหรือเป็นห่วงสุขภาพ
              กรุณานำผลนี้ไปปรึกษาแพทย์หรือบุคลากรทางการแพทย์
            </p>
          </>
        ) : (
          <p role="status">กำลังรวบรวมสัญญาณ…</p>
        )}
      </section>
    </main>
  )
}
