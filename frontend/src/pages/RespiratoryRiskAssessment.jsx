import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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

// หน้าประเมินความเสี่ยงโรคทางเดินหายใจ — โหมดเดียว: **อัปโหลดคลิปวิดีโอ** (Phase 23)
// วิเคราะห์ HR จากคลิปด้วย vitallens rPPG ผ่าน backend /api/vital-signs (โหมด local)
//   + สัญญาณที่ 3: ผลแบบประเมินอาการเดิม (risk_assessments)
//   + สัญญาณ RR: วัดที่หน้า "ตรวจการหายใจด้วยกล้อง" (/breathing-check) — หน้านี้ไม่มีกล้อง
// คัดกรองเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์
// ทุกสัญญาณขาดได้ — หน้านี้จะแจ้งเสมอว่าใช้/ขาดสัญญาณไหน
//
// Logic ทั้งหมด (consent, vitallens, scoring, clinician summary, provenance)
// ใช้ของเดิมที่ทดสอบผ่านแล้ว — Phase 23 ตัดเฉพาะโหมดกล้องสดและ toggle ออกตามที่ผู้ใช้สั่ง

const SAMPLE_CLIP_URL = '/demo/sample-breathing.mp4'

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
  // ─── logic เดิม (ไม่แก้) ───
  const [vitals, setVitals] = useState(null) // { hrBpm, spo2Percent, rrFromVitals, hrConfidence }
  const [vitalsStatus, setVitalsStatus] = useState('idle') // idle | loading | ok | failed
  const [vitalsMessage, setVitalsMessage] = useState(null)
  const vitalsLoading = vitalsStatus === 'loading'
  const [questionnaire, setQuestionnaire] = useState(null) // { score, redFlag, exists }
  const [questionnaireLoading, setQuestionnaireLoading] = useState(true)
  const [anonCode, setAnonCode] = useState('UNKNOWN')
  // Phase 5 — Consent: ต้องยอมรับก่อนอัปโหลดคลิป; research consent ไม่ติ๊กไว้ล่วงหน้า
  const [consent, setConsent] = useState({ camera: false, limitations: false, research: false })
  const consentReady = consent.camera && consent.limitations

  // ─── UI shell (mockup) — ไฟล์วิดีโอที่เลือก; การประมวลผลยังใช้ logic เดิม ───
  const [videoFile, setVideoFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const fileInputRef = useRef(null)

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

  const handleVideoRecorded = useCallback(async (blob) => {
    if (!blob) {
      setVitalsStatus('failed')
      setVitalsMessage('ไม่ได้รับคลิปวิดีโอ — ข้ามสัญญาณ vitallens (HR/SpO2)')
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
      setVitalsMessage(`vitallens ประมวลผลไม่สำเร็จ (${result.error || 'ไม่ทราบสาเหตุ'}) — ใช้แบบประเมินอาการแทน`)
    }
  }, [])

  // ─── UI shell handlers — เรียก logic เดิมข้างบนทั้งหมด ───

  // object URL สำหรับ preview วิดีโอ — สร้างตอนผู้ใช้เลือกไฟล์ (ไม่ใช่ใน effect) และเพิกถอนตัวเก่าทุกครั้ง
  const previewUrlRef = useRef(null)
  const setVideoPreview = useCallback((fileOrBlob) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    if (!fileOrBlob) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(fileOrBlob)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }, [])
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  const handleSelectFile = useCallback((event) => {
    const file = event.target.files?.[0]
    if (file) setVideoFile(file)
    setVideoPreview(file)
  }, [setVideoPreview])

  const handleUseSample = useCallback(async () => {
    try {
      setVitalsStatus('loading')
      const response = await fetch(SAMPLE_CLIP_URL)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const file = new File([blob], 'sample-breathing.mp4', { type: 'video/mp4' })
      setVideoFile(file)
      setVideoPreview(file)
      setVitalsStatus('idle')
    } catch {
      setVitalsStatus('failed')
      setVitalsMessage('โหลดคลิปตัวอย่างไม่สำเร็จ — ลองเลือกไฟล์วิดีโอของคุณเอง')
    }
  }, [setVideoPreview])

  const handleStartVideo = useCallback(async () => {
    if (!videoFile || vitalsLoading) return
    await handleVideoRecorded(videoFile)
  }, [videoFile, vitalsLoading, handleVideoRecorded])
  // ─── derived state (จาก state/logic เดิม ไม่มี state จำลอง) ───
  // RR วัดที่หน้า "ตรวจการหายใจด้วยกล้อง" (/breathing-check) — หน้านี้โหมดเดียว: อัปโหลดวิดีโอ
  const usableRr = null
  const riskResult = useMemo(
    () => computeRespiratoryRisk({
      rrFromCamera: usableRr,
      spo2Percent: vitals?.spo2Percent ?? null,
      hrBpm: vitals?.hrBpm ?? null,
      questionnaire,
    }),
    [usableRr, vitals, questionnaire],
  )

  const measurementContracts = useMemo(() => {
    const rrMissing = 'วัดอัตราการหายใจ (RR) ที่หน้า "ตรวจการหายใจด้วยกล้อง" (/breathing-check) — หน้านี้รองรับเฉพาะการอัปโหลดคลิปวิเคราะห์ HR'
    const hrMissing = vitals
      ? null
      : (vitalsStatus === 'failed' && vitalsMessage ? vitalsMessage : 'ยังไม่มีการวิเคราะห์วิดีโอด้วย vitallens')
    const rrContract = createSignalMeasurement({
      key: 'rr',
      label: 'อัตราการหายใจ (RR)',
      unit: 'ครั้ง/นาที',
      value: null,
      usable: false,
      source: 'วัดที่หน้า "ตรวจการหายใจด้วยกล้อง" (/breathing-check) — MediaPipe Pose (ประมวลผลในเครื่องผู้ใช้)',
      measuredAt: null,
      durationSeconds: null,
      qualityStatus: CONTRACT_QUALITY_STATUS.NOT_ASSESSED,
      missingReason: rrMissing,
    })
    const hrContract = createSignalMeasurement({
      key: 'hr',
      label: 'อัตราการเต้นหัวใจ (HR)',
      unit: 'bpm',
      value: vitals?.hrBpm ?? null,
      usable: Number.isFinite(vitals?.hrBpm),
      source: 'VitalLens POS rPPG จากคลิปวิดีโอ (ประมวลผลในเครื่อง server ท้องถิ่น — ไม่ส่งออกอินเทอร์เน็ต)',
      measuredAt: vitals?.measuredAt ?? null,
      durationSeconds: null,
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
  }, [vitals, vitalsStatus, vitalsMessage, questionnaire])

  const clinicianSummary = useMemo(
    () => buildClinicianSummary({ signals: measurementContracts, scoring: riskResult, anonCode }),
    [measurementContracts, riskResult, anonCode],
  )

  // ปุ่ม "เริ่มประเมินจากวิดีโอ" พร้อมเมื่อ: ยินยอมครบ + เลือกไฟล์แล้ว + ไม่อยู่ระหว่างประมวลผล
  const readyForVideo = consentReady && Boolean(videoFile) && !vitalsLoading

  const headerTips = {
    title: 'แนะนำการถ่ายวิดีโอ',
    rows: ['แนะนำวิดีโอความยาว 10-30 วินาที (ไม่เกิน 60MB)', 'ถ่ายแบบนิ่ง เห็นช่วงไหล่ถึงหน้าอกส่วนบนชัดเจน', 'แสงสม่ำเสมอพอ ไม่มืดจนเกินไปเพื่อความแม่นยำ'],
  }

  const readyRowCopy = videoFile && vitalsStatus === 'ok'
    ? { title: 'วิดีโอพร้อมสำหรับการประเมิน', desc: 'vitallens ประมวลผลเสร็จแล้ว — ดูผลรวมด้านล่าง' }
    : videoFile && vitalsStatus === 'failed'
      ? { title: 'ประมวลผลวิดีโอไม่สำเร็จ', desc: 'ลองไฟล์อื่น หรือประเมินจากสัญญาณที่เหลือแทน' }
      : { title: 'ยังไม่พร้อมสำหรับการประเมิน', desc: 'เลือกไฟล์วิดีโอแล้วกด "เริ่มประเมินจากวิดีโอ"' }

  return (
    <main className="resp-page">
      <div className="resp-warning-banner">
        <span>
          ฟีเจอร์ทดลอง ใช้โมเดล pose detection และ rPPG สำเร็จรูป ความแม่นยำจำกัด
          ใช้เพื่อสาธิตแนวคิดเท่านั้น ไม่ใช่ค่าทางการแพทย์
        </span>
      </div>

      <div className="resp-header">
        <div className="resp-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ width: 28, height: 28 }}>
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
          </svg>
        </div>
        <div className="resp-header-text">
          <h1>ประเมินความเสี่ยงโรคทางเดินหายใจ ด้วยการอัปโหลดคลิป</h1>
          <p>อัปโหลดคลิปวิดีโอเพื่อวิเคราะห์อัตราการเต้นหัวใจด้วย vitallens rPPG (โหมด local)</p>
          <p className="rrisk-disclaimer">{RISK_DISCLAIMER}</p>
        </div>
      </div>

      <div className="resp-header-tips-card">
        <strong>{headerTips.title}</strong>
        <ul>
          {headerTips.rows.map((row) => <li key={row}>{row}</li>)}
        </ul>
      </div>

      <div className="resp-grid">
        {/* ===== คอลัมน์ซ้าย: consent + เลือกไฟล์วิดีโอ ===== */}
        <div className="resp-col-main">
          <div className="resp-consent-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: 22, height: 22, color: 'var(--color-primary)', flexShrink: 0 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 5.25 3.4 9.74 8 10 4.6-.26 8-4.75 8-10" />
            </svg>
            <div style={{ flex: 1 }}>
              <strong>ก่อนอัปโหลดคลิป — ความเป็นส่วนตัวและความยินยอม</strong>
              <p>
                คลิปของคุณถูกประมวลผลเพื่อการสาธิตเท่านั้น — รายละเอียดการยินยอมตามข้อความด้านล่าง
              </p>
              <CameraConsent consent={consent} onConsentChange={setConsent} />
            </div>
          </div>

          {!consentReady && (
            <div className="resp-pending-banner">
              <strong>สถานะก่อนเลือกไฟล์</strong>
              <span>กรุณาติ๊กยอมรับด้านบนก่อนอัปโหลดคลิป</span>
            </div>
          )}

          <div className="resp-dropzone">
            <button
              type="button"
              className="resp-play-circle"
              onClick={() => fileInputRef.current?.click()}
              disabled={!consentReady}
              aria-label="เลือกไฟล์วิดีโอ"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ width: 28, height: 28 }}>
                <path d="M8 5.14v13.72L19 12 8 5.14Z" />
              </svg>
            </button>
            <p className="resp-dropzone-text">เลือกหรือลากไฟล์วิดีโอจากที่นี่</p>
            {videoFile && <p className="resp-file-chip">ไฟล์ที่เลือก: {videoFile.name || 'คลิปตัวอย่าง sample-breathing.mp4'}</p>}
            <div className="resp-dropzone-actions">
              <button
                type="button"
                className="resp-btn-outline"
                disabled={!consentReady}
                onClick={() => fileInputRef.current?.click()}
              >
                เลือกไฟล์วิดีโอ
              </button>
              <button
                type="button"
                className="resp-btn-outline"
                disabled={!consentReady}
                onClick={handleUseSample}
              >
                ใช้คลิปตัวอย่าง
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              hidden
              disabled={!consentReady || vitalsLoading}
              onChange={handleSelectFile}
            />
            <p className="resp-dropzone-hint">รองรับ MP4, WebM, MOV · ขนาดไม่เกิน 60 MB</p>
          </div>
        </div>

        {/* ===== คอลัมน์กลาง: preview วิดีโอ + สถานะ vitallens ===== */}
        <div className="resp-col-preview">
          <div className="resp-preview-card">
            {videoFile && previewUrl ? (
              <video key={previewUrl} src={previewUrl} controls muted playsInline />
            ) : (
              <>
                <button type="button" className="resp-play-circle" disabled aria-hidden="true" tabIndex={-1}>
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ width: 28, height: 28 }}>
                    <path d="M8 5.14v13.72L19 12 8 5.14Z" />
                  </svg>
                </button>
                <p className="resp-preview-title">Preview วิดีโอจะแสดงที่นี่</p>
                <p className="resp-dropzone-hint">ความยาวคลิปสั้นเพื่อความรวดเร็ว</p>
              </>
            )}
            {videoFile && previewUrl && <p className="resp-preview-title">ตัวอย่างคลิปที่เลือก</p>}
            {/* สัญญาณที่ 2 — สถานะ vitallens (ข้อความ/เงื่อนไขเดิมทุกอย่าง) */}
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
          </div>

          <div className="resp-quality-card">
            <h3>สถานะการวิเคราะห์</h3>
            <ul className="resp-quality-list">
              <li>
                <span className="resp-quality-label">สัญญาณ vitallens (HR)</span>
                <span className={`resp-quality-badge ${vitalsStatus === 'ok' ? 'status-ok' : vitalsStatus === 'failed' ? 'status-fail' : ''}`}>
                  {vitalsStatus === 'ok' ? 'ผ่าน' : vitalsStatus === 'failed' ? 'ไม่ผ่าน' : vitalsLoading ? 'กำลังตรวจ' : 'รอข้อมูล'}
                </span>
              </li>
              <li>
                <span className="resp-quality-label">Algorithm Confidence</span>
                <span className={`resp-quality-badge ${vitals?.hrQuality?.level === 'low_confidence_warning' ? 'status-warn' : vitals ? 'status-ok' : ''}`}>
                  {vitals ? (vitals.hrConfidence != null ? vitals.hrConfidence.toFixed(2) : 'ไม่มี') : 'รอข้อมูล'}
                </span>
              </li>
              <li>
                <span className="resp-quality-label">RR (MediaPipe)</span>
                <span className="resp-quality-badge">วัดที่หน้าตรวจการหายใจ</span>
              </li>
            </ul>

            <div className="resp-ready-row">
              <div>
                <strong>{readyRowCopy.title}</strong>
                <p>{readyRowCopy.desc}</p>
              </div>
            </div>

            <button
              type="button"
              className="resp-btn-primary resp-btn-wide"
              disabled={!readyForVideo}
              onClick={handleStartVideo}
            >
              เริ่มประเมินจากวิดีโอ
            </button>
          </div>
        </div>
      </div>

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
            ยังไม่มีผลแบบประเมินอาการ — <Link to="/assessment">ไปทำแบบประเมินเดิม</Link> (หรือดูผลรวมด้านล่างโดยไม่ใช้สัญญาณนี้)
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
            <ul className="rrisk-signal-list">
              {measurementContracts.map((contract) => {
                const rulePoints = riskResult.signals.find((signal) => signal.key === contract.key)
                return (
                  <li key={contract.key} className={`rrisk-signal rrisk-signal--${rulePoints?.category ?? 'unavailable'}`}>
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
                    <p className={`rrisk-layer2 rrisk-qualitytext--${contract.qualityStatus}`}>
                      คุณภาพสัญญาณ: {QUALITY_DISPLAY[contract.qualityStatus]}
                      {contract.qualityReasons.length > 0 && ` (${contract.qualityReasons.join(', ')})`}
                    </p>
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
              {riskResult.missingSignalKeys.length > 0 && (
                <p className="rrisk-coverage-missing">
                  สัญญาณที่ขาดไป: {riskResult.missingSignalKeys.map((key) => MISSING_SIGNAL_LABELS[key]).join(' · ')}
                </p>
              )}
              <p className="rrisk-accuracy">{CLINICAL_ACCURACY_STATUS}</p>
            </div>
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
