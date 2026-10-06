import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  DATA_PROVENANCE_STATUS,
} from '../utils/measurementContract'

// หน้าประเมินความเสี่ยงโรคทางเดินหายใจ รวม 3 สัญญาณเข้าด้วยกัน (rule-based weighted scoring):
//   1. อัตราการหายใจ (RR) จาก MediaPipe Pose (คอมโพเนนต์ RrCameraCapture)
//   2. HR/SpO2 โดยประมาณจาก vitallens rPPG ผ่าน backend /api/vital-signs
//   3. คะแนนแบบประเมินอาการเดิม (risk_assessments — ใช้เกณฑ์ 5/10/16 + red flag เดิมของ Assessment.jsx)
// คัดกรองเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์
// ทุกสัญญาณขาดได้ — ไม่มีกล้องก็ยังประเมินจากแบบประเมินอย่างเดียวได้ และหน้านี้จะแจ้งเสมอว่าใช้/ขาดสัญญาณไหน
//
// 2026-10-06 — UI รูปทรงใหม่ตาม mockup (prefix resp-): toggle 2 โหมด (กล้องสด / อัปโหลดคลิป)
// โดย logic ทั้งหมด (consent, quality gate, MediaPipe, vitallens, scoring, clinician summary) ใช้ของเดิมที่ทดสอบผ่านแล้ว

const SAMPLE_CLIP_URL = '/demo/sample-breathing.mp4'

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

const CHECK_BADGE_CLASS = {
  pass: 'status-ok',
  warn: 'status-warn',
  fail: 'status-fail',
}

const MISSING_SIGNAL_LABELS = {
  rr: 'อัตราการหายใจ (RR จากกล้อง)',
  spo2: 'ออกซิเจนในเลือด (SpO2)',
  hr: 'อัตราการเต้นหัวใจ (HR)',
  questionnaire: 'แบบประเมินอาการ',
}

export default function RespiratoryRiskAssessment() {
  // ─── logic เดิม (ไม่แก้) ───
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

  // ─── UI shell (mockup) — โหมด + ไฟล์วิดีโอที่เลือก; การประมวลผลยังใช้ logic เดิม ───
  const [mode, setMode] = useState('video') // 'video' | 'camera'
  const [videoFile, setVideoFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [cameraStatus, setCameraStatus] = useState('idle') // สถานะของ RrCameraCapture (idle|preparing|measuring|done|error)
  const startFnRef = useRef(null)
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

  // ─── UI shell handlers — เรียก logic เดิมข้างบนทั้งหมด ───
  const CONSENT_REQUIRED_NOTE = 'ต้องให้ความยินยอมด้านบน (ยินยอมกล้อง + รับทราบข้อจำกัด) ก่อนอัปโหลดวิดีโอ'

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
    event.target.value = ''
    if (!file) return
    if (!consentReady) {
      setCancelNote(CONSENT_REQUIRED_NOTE)
      return
    }
    setCancelNote(null)
    setVideoFile(file)
    setVideoPreview(file)
  }, [consentReady, setVideoPreview])

  const handleUseSample = useCallback(async () => {
    if (!consentReady) {
      setCancelNote(CONSENT_REQUIRED_NOTE)
      return
    }
    try {
      const response = await fetch(SAMPLE_CLIP_URL)
      if (!response.ok) throw new Error('sample clip not found')
      const blob = await response.blob()
      setCancelNote(null)
      setVideoFile(blob)
      setVideoPreview(blob)
    } catch {
      setCancelNote('ยังไม่มีคลิปตัวอย่างในเครื่อง — วางไฟล์ไว้ที่ frontend/public/demo/sample-breathing.mp4 แล้วลองใหม่')
    }
  }, [consentReady, setVideoPreview])

  // ปุ่ม "เริ่มประเมินจากวิดีโอ" — ส่งไฟล์เข้า vitallens ผ่าน handleVideoRecorded เดิม (เส้นทางเดียวกับการอัปโหลดเก่า)
  const handleStartVideo = useCallback(async () => {
    if (!consentReady) {
      setCancelNote(CONSENT_REQUIRED_NOTE)
      return
    }
    if (!videoFile || vitalsStatus === 'loading') return
    await handleVideoRecorded(videoFile)
  }, [consentReady, videoFile, vitalsStatus, handleVideoRecorded])

  // ปุ่ม "เริ่มวิเคราะห์อัตราการหายใจ" (โหมดกล้อง) — เรียก start() ของ RrCameraCapture ผ่าน registerStart
  const handleRegisterStart = useCallback((fn) => { startFnRef.current = fn }, [])
  const handleCameraStatus = useCallback((status) => setCameraStatus(status), [])
  const handleRequestCamera = useCallback(() => {
    if (!consentReady) {
      setCancelNote('ต้องให้ความยินยอมด้านบน (ยินยอมกล้อง + รับทราบข้อจำกัด) ก่อนเปิดกล้อง')
      return
    }
    startFnRef.current?.()
  }, [consentReady])

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

  // ─── derived UI state (จาก state/logic เดิม ไม่มี state จำลอง) ───
  const readyForVideo = consentReady && videoFile !== null && !vitalsLoading
  const readyForCamera = consentReady && cameraStatus !== 'preparing' && cameraStatus !== 'measuring'

  // quality checks จริง 9 ข้อจาก quality gate เดิม — ก่อนวัดยังไม่รัน (not_run)
  const qualityChecks = rr?.quality?.checks ?? Object.keys(CHECK_LABELS).map((id) => ({ id, status: 'not_run', detail: '' }))

  const headerCopy =
    mode === 'video'
      ? { desc: 'อัปโหลดวิดีโอเพื่อวิเคราะห์อัตราการหายใจจากการเคลื่อนไหวในภาพ (vitallens rPPG)' }
      : { desc: 'วัดอัตราการหายใจจากการเคลื่อนไหวไหล่ด้วยกล้อง (MediaPipe Pose) — ต้นแบบประมาณการเคลื่อนไหวจากภาพ ไม่ใช่การคัดกรองหรือวินิจฉัยโรค' }

  const readyRowCopy =
    mode === 'video'
      ? videoFile && vitalsStatus === 'ok'
        ? { title: 'วิดีโอพร้อมสำหรับการประเมิน', desc: 'vitallens ประมวลผลเสร็จแล้ว — ดูผลรวมด้านล่าง' }
        : videoFile && vitalsStatus === 'failed'
          ? { title: 'ประมวลผลวิดีโอไม่สำเร็จ', desc: 'ลองไฟล์อื่น หรือประเมินจากสัญญาณที่เหลือแทน' }
          : { title: 'ยังไม่พร้อมสำหรับการประเมิน', desc: 'เลือกไฟล์วิดีโอแล้วกด "เริ่มประเมินจากวิดีโอ"' }
      : rr?.quality?.canUseMeasurement && rr.reliable
        ? { title: 'ภาพพร้อมสำหรับการประเมิน', desc: 'วัด RR สำเร็จและคุณภาพผ่านเกณฑ์ — ดูผลรวมด้านล่าง' }
        : { title: 'ยังไม่พร้อมสำหรับการประเมิน', desc: 'กด "เริ่มวิเคราะห์อัตราการหายใจ" เพื่อวัด 30 วินาที' }

  return (
    <main className="resp-page">
      <div className="resp-warning-banner">
        <WarningIcon />
        <span>
          ฟีเจอร์ทดลอง ใช้โมเดล pose detection และ rPPG สำเร็จรูป ความแม่นยำจำกัด
          ใช้เพื่อสาธิตแนวคิดเท่านั้น ไม่ใช่ค่าทางการแพทย์
        </span>
      </div>

      <div className="resp-header">
        <div className="resp-header-icon">
          <CameraIcon />
        </div>
        <div className="resp-header-text">
          <h1>ประเมินความเสี่ยงโรคทางเดินหายใจ</h1>
          <p>{headerCopy.desc}</p>
          <p className="rrisk-disclaimer">{RISK_DISCLAIMER}</p>
        </div>
        <div className="resp-header-illustration">
          <LungsIcon />
        </div>
      </div>

      {mode === 'video' && (
        <div className="resp-tips-bar">
          <TipRow text="แนะนำวิดีโอความยาว 10-30 วินาที (ไม่เกิน 60MB)" />
          <TipRow text="ถ่ายแบบนิ่ง เห็นช่วงไหล่ถึงหน้าอกส่วนบนชัดเจน" />
          <TipRow text="แสงสม่ำเสมอพอ ไม่มืดจนเกินไปเพื่อความแม่นยำ" />
        </div>
      )}

      <div className="resp-mode-toggle" role="tablist" aria-label="เลือกโหมดการประเมิน">
        <button
          type="button"
          className={mode === 'camera' ? 'active' : ''}
          onClick={() => setMode('camera')}
        >
          <CameraSmallIcon /> กล้องสด
        </button>
        <button
          type="button"
          className={mode === 'video' ? 'active' : ''}
          onClick={() => setMode('video')}
        >
          <VideoSmallIcon /> อัปโหลดคลิปวิดีโอ
        </button>
      </div>

      <div className="resp-grid">
        {/* ===== คอลัมน์ซ้าย ===== */}
        <div className="resp-col-main">
          <div className="resp-consent-card">
            <ShieldIcon />
            <div style={{ flex: 1 }}>
              <strong>
                {mode === 'video'
                  ? 'ก่อนอัปโหลดคลิป — ความเป็นส่วนตัวและความยินยอม'
                  : 'ก่อนเปิดกล้อง — ความเป็นส่วนตัวและความยินยอม'}
              </strong>
              <p>
                คลิปของคุณถูกประมวลผลเพื่อการสาธิตเท่านั้น — รายละเอียดการยินยอมตามข้อความด้านล่าง
                (ยกเลิกได้ทุกเมื่อระหว่างวัด)
              </p>
              {/* Consent เดิม (Phase 5) — audit log + gate 3 checkbox ครบ ไม่แก้ logic */}
              <CameraConsent consent={consent} onConsentChange={setConsent} />
            </div>
          </div>

          {!consentReady && (
            <div className="resp-pending-banner">
              <strong>สถานะก่อนเลือกไฟล์</strong>
              <span>
                {mode === 'video'
                  ? 'กรุณาติ๊กยอมรับด้านบนก่อนอัปโหลดคลิป'
                  : 'กรุณาติ๊กยอมรับด้านบนก่อนเปิดกล้อง'}
              </span>
            </div>
          )}

          {mode === 'video' ? (
            <div className="resp-dropzone">
              <button
                type="button"
                className="resp-play-circle"
                onClick={() => fileInputRef.current?.click()}
                disabled={!consentReady}
                aria-label="เลือกไฟล์วิดีโอ"
              >
                <PlayIcon />
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
          ) : (
            <div className="resp-camera-frame">
              {/* คอมโพเนนต์กล้องเดิม — MediaPipe Pose + MediaRecorder + quality gate ครบ */}
              <RrCameraCapture
                onRrResult={handleRrResult}
                onVideoRecorded={handleVideoRecorded}
                onCancel={setCancelNote}
                enabled={consentReady}
                registerStart={handleRegisterStart}
                onStatusChange={handleCameraStatus}
              />
            </div>
          )}

          {rr && (
            <div className="rrisk-rr-outcome">
              <p className={`rrisk-signal-${rr.quality?.canUseMeasurement && rr.reliable ? 'ok' : 'warn'}`} role="status">
                {rr.quality?.canUseMeasurement && rr.reliable
                  ? `วัดได้ RR ${Math.round(rr.bpm)} ครั้ง/นาที (จาก ${rr.sampleCount} จุดตัวอย่าง, ${Math.round(rr.elapsedMs / 1000)} วินาที)`
                  : rr.rawBpm != null
                    ? `ค่าดิบที่ประมาณได้ ${Math.round(rr.rawBpm)} ครั้ง/นาที แต่ไม่ถูกนำไปใช้เพราะคุณภาพไม่ผ่านเกณฑ์`
                    : 'ประมาณค่า RR ไม่สำเร็จ — ค่านี้จะไม่ถูกนำไปใช้'}
              </p>
            </div>
          )}
        </div>

        {/* ===== คอลัมน์ขวา ===== */}
        <div className="resp-col-side">
          {(mode === 'video' || vitalsLoading || vitalsStatus !== 'idle') && (
          <div className="resp-preview-card">
            {mode === 'video' && videoFile && previewUrl ? (
              <video key={previewUrl} src={previewUrl} controls muted playsInline />
            ) : mode === 'video' ? (
              <button type="button" className="resp-play-circle small" disabled aria-label="ยังไม่มีวิดีโอตัวอย่าง">
                <PlayIcon />
              </button>
            ) : null}
            {mode === 'video' && <p>{videoFile ? 'ตัวอย่างคลิปที่เลือก' : 'Preview วิดีโอจะแสดงที่นี่'}</p>}
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
          )}

          <div className="resp-quality-card">
            <h3>ตรวจคุณภาพวิดีโอ</h3>
            {mode === 'camera' && rr?.quality && (
              <div className={`rrisk-quality rrisk-quality--${rr.quality.qualityStatus}`}>
                <p className="rrisk-quality-title">
                  Quality Gate: {QUALITY_STATUS_LABELS[rr.quality.qualityStatus]}
                  {rr.quality.qualityStatus === QUALITY_STATUS.INSUFFICIENT && rr.quality.missingReason ? ` — ${rr.quality.missingReason}` : ''}
                </p>
                {rr.quality.retryGuidance && <p className="rrisk-retry">{rr.quality.retryGuidance}</p>}
              </div>
            )}
            <ul className="resp-quality-list">
              {mode === 'video' ? (
                <>
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
                    <span className="resp-quality-label">Quality Gate 9 ข้อ</span>
                    <span className="resp-quality-badge">ใช้กับการวัดด้วยกล้องสด</span>
                  </li>
                </>
              ) : (
                qualityChecks.map((item) => (
                  <li key={item.id} title={item.detail || undefined}>
                    <span className="resp-quality-label">{CHECK_LABELS[item.id] || item.id}</span>
                    <span className={`resp-quality-badge ${CHECK_BADGE_CLASS[item.status] || ''}`}>
                      {CHECK_STATUS_LABELS[item.status] || 'รอข้อมูล'}
                    </span>
                  </li>
                ))
              )}
            </ul>

            <div className="resp-ready-row">
              <CheckCircleIcon />
              <div>
                <strong>{readyRowCopy.title}</strong>
                <p>{readyRowCopy.desc}</p>
              </div>
            </div>

            {mode === 'video' ? (
              <button
                type="button"
                className="resp-btn-primary resp-btn-wide"
                disabled={!readyForVideo}
                onClick={handleStartVideo}
              >
                <PlayIcon small /> เริ่มประเมินจากวิดีโอ
              </button>
            ) : (
              <button
                type="button"
                className="resp-btn-primary resp-btn-wide"
                disabled={!readyForCamera || !consentReady}
                onClick={handleRequestCamera}
                title={!consentReady ? 'ต้องให้ความยินยอมก่อน' : undefined}
              >
                <CameraSmallIcon />
                {cameraStatus === 'preparing'
                  ? 'กำลังเตรียมกล้อง…'
                  : cameraStatus === 'measuring'
                    ? 'กำลังบันทึกสัญญาณ (ดูความคืบหน้าทางซ้าย)'
                    : 'เริ่มวิเคราะห์อัตราการหายใจ'}
              </button>
            )}
          </div>
        </div>
      </div>

      {cancelNote && <p className="rrisk-signal-warn" role="status">{cancelNote}</p>}

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
            {/* Phase 9 — Data Provenance & Model Status: ที่มาของโมเดล/ไลบรารี/สถานะการประเมิน */}
            <details className="rrisk-provenance" aria-label="ที่มาของโมเดลและสถานะการประเมิน">
              <summary>Data Provenance &amp; Model Status (โปร่งใสเรื่องโมเดล/เวอร์ชัน/ไลเซนส์)</summary>
              <table className="rrisk-provenance-table">
                <thead>
                  <tr><th>บทบาท</th><th>โมเดล/ไลบรารี</th><th>เวอร์ชัน</th><th>ไลเซนส์</th></tr>
                </thead>
                <tbody>
                  {DATA_PROVENANCE_STATUS.libraries.map((lib) => (
                    <tr key={lib.role}>
                      <td>{lib.role}</td>
                      <td>{lib.name}</td>
                      <td>{lib.version}</td>
                      <td>{lib.license}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>Dataset/Training Source: {DATA_PROVENANCE_STATUS.trainingSource}</p>
              <p>Last Evaluation Date: {DATA_PROVENANCE_STATUS.lastEvaluationDate
                ? new Date(DATA_PROVENANCE_STATUS.lastEvaluationDate).toLocaleString('th-TH')
                : 'ยังไม่มี — ยังไม่ได้ประเมินกับ dataset อ้างอิง'}</p>
              <p>Metrics Status: {DATA_PROVENANCE_STATUS.metricsStatus}</p>
              {DATA_PROVENANCE_STATUS.evaluation && (
                <p>
                  Offline Evaluation ล่าสุด: {DATA_PROVENANCE_STATUS.evaluation.dataset} · Track: {DATA_PROVENANCE_STATUS.evaluation.track} · Modality: {DATA_PROVENANCE_STATUS.evaluation.modality} · {DATA_PROVENANCE_STATUS.evaluation.participantCount} participants / {DATA_PROVENANCE_STATUS.evaluation.windowCount} หน้าต่าง (ใช้จริง {DATA_PROVENANCE_STATUS.evaluation.windowsUsed}) · MAE {DATA_PROVENANCE_STATUS.evaluation.metrics.mae} · Bias {DATA_PROVENANCE_STATUS.evaluation.metrics.meanBias} · Camera Accuracy: {DATA_PROVENANCE_STATUS.evaluation.cameraAccuracy} · Clinical Accuracy: {DATA_PROVENANCE_STATUS.evaluation.clinicalAccuracy}
                </p>
              )}
            </details>
            <p className="rrisk-disclaimer">
              {RISK_DISCLAIMER} ค่าทั้งหมดเป็นค่าประมาณจากกล้อง ไม่ใช่ค่าจากอุปกรณ์การแพทย์ หากมีอาการผิดปกติหรือเป็นห่วงสุขภาพ
              กรุณานำผลนี้ไปปรึกษาแพทย์หรือบุคลากรทางการแพทย์
            </p>
          </>
        ) : (
          <p role="status">กำลังรวบรวมสัญญาณ…</p>
        )}
      </section>

      <details className="resp-privacy-accordion">
        <summary>
          <ShieldIcon /> ความเป็นส่วนตัวของคุณ
        </summary>
        <p>
          ข้อมูลภาพใช้สำหรับการประเมินนี้เท่านั้น การวิเคราะห์อัตราการหายใจเกิดขึ้นในเครื่องของคุณ (MediaPipe)
          ส่วนชีพจรถูกส่งไป backend ในเครื่องเท่านั้น และระบบไม่เก็บคลิปวิดีโอไว้ในฐานข้อมูลหรือดิสก์ถาวร
          กรุณาอ่านรายละเอียดและยินยอมก่อนเริ่มใช้งาน
        </p>
      </details>
    </main>
  )
}

/* ===== Icons — โปรเจกต์ไม่มี icon library (ไม่มี lucide-react) จึงใช้ inline SVG ตาม shell ===== */
function WarningIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
}
function CameraIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>
}
function CameraSmallIcon() { return <CameraIcon /> }
function VideoSmallIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
}
function LungsIcon() {
  return <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3v8c0 3-2 5-4 5s-3-2-3-5V7M15 3v8c0 3 2 5 4 5s3-2 3-5V7M9 3h6"/></svg>
}
function ShieldIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5Z"/></svg>
}
function PlayIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7Z"/></svg>
}
function CheckCircleIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
}

function TipRow({ text }) {
  return (
    <div className="resp-tip-row">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="m5 12 5 5L20 7" />
      </svg>
      <span>{text}</span>
    </div>
  )
}
