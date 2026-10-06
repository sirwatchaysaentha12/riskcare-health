import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeCameraFrame, isVideoFrameReady } from '../utils/cameraQuality'
import { computeBreathingRate, extractShoulderY } from '../utils/breathingRate'
import { RISK_QUESTIONS, computeRiskLevel } from '../utils/riskQuestionnaire'
import PageMenuButton from '../components/PageMenuButton'
import '../styles/breathing.css'

// ฟีเจอร์ทดลอง — ใช้โมเดล pose detection สำเร็จรูปจาก Google MediaPipe (pretrained)
// ผลลัพธ์เป็นข้อมูลอ้างอิงเสริมเท่านั้น ไม่เชื่อมกับ risk scoring และไม่ใช่ค่าทางการแพทย์
// หมายเหตุทางเทคนิค: ใช้ MediaPipe Tasks Vision (PoseLandmarker) — API ทางการที่ Google รองรับ
// (แพ็กเกจ legacy @mediapipe/pose โยน "memory access out of bounds" จาก WASM ของมันเอง — ทดสอบจริง 2026-09-25)

// โหลดจากไฟล์ในเครื่อง (public/mediapipe/) — ทำงานออฟไลน์ได้ ไม่พึ่ง CDN ตอนรัน (ไฟล์ตรวจด้วย npm run demo-check)
const TASKS_VISION_URL = '/mediapipe'
const POSE_MODEL_URL = '/mediapipe/pose_landmarker_lite.task'
const SAMPLE_CLIP_URL = '/demo/sample-breathing.mp4'
const MEASURE_DURATION_MS = 30000
const DISCLAIMER = 'ฟีเจอร์ทดลอง ใช้โมเดล pose detection สำเร็จรูป ความแม่นยำจำกัด ใช้เพื่อสาธิตแนวคิดเท่านั้น ไม่ใช่ค่าทางการแพทย์'

let landmarkerPromise = null
// โหลด PoseLandmarker (pretrained lite model) — คืน Promise, guard กันโหลดซ้ำ
function loadPoseLandmarker() {
  if (landmarkerPromise) return landmarkerPromise
  landmarkerPromise = (async () => {
    const vision = await import(/* @vite-ignore */ `${TASKS_VISION_URL}/vision_bundle.mjs`)
    const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_VISION_URL}/wasm`)
    return vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
    })
  })().catch((error) => {
    landmarkerPromise = null
    throw error
  })
  return landmarkerPromise
}

function closePoseLandmarker(landmarker) {
  try { landmarker?.close?.() } catch { /* ปิดโมเดลไม่สำเร็จไม่กระทบ */ }
  landmarkerPromise = null
}

function drawShoulderOverlay(canvas, landmarks) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!landmarks) return
  const bodyPoints = [11, 12, 23, 24]
    .map((index) => landmarks[index])
    .filter((point) => point && (point.visibility ?? 1) >= 0.5)
  if (bodyPoints.length >= 3) {
    const xs = bodyPoints.map((point) => point.x * canvas.width)
    const ys = bodyPoints.map((point) => point.y * canvas.height)
    const left = Math.max(0, Math.min(...xs) - 24)
    const top = Math.max(0, Math.min(...ys) - 20)
    const right = Math.min(canvas.width, Math.max(...xs) + 24)
    const bottom = Math.min(canvas.height, Math.max(...ys) + 20)
    ctx.strokeStyle = bodyPoints.length === 4 ? '#35c48d' : '#f2b84b'
    ctx.lineWidth = 3
    ctx.setLineDash([9, 6])
    ctx.strokeRect(left, top, right - left, bottom - top)
    ctx.setLineDash([])
  }
  for (const index of [0, 11, 12, 23, 24]) {
    const point = landmarks[index]
    if (!point || (point.visibility ?? 1) < 0.5) continue
    ctx.beginPath()
    ctx.arc(point.x * canvas.width, point.y * canvas.height, index === 0 ? 6 : 7, 0, Math.PI * 2)
    ctx.fillStyle = '#29977c'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
}

// vision loop อยู่ระดับ module (นอก component) — ประมวลผลทุก frame, เก็บ sample ตอนวัด,
// เรียก onDone เมื่อครบ 30 วิ และ onFrameUi (throttle 200ms) สำหรับอัปเดตหน้าจอ
function createVisionLoop({ landmarkerRef, videoRef, canvasRef, qualityCanvasRef, previousFrameRef, lastQualityCheckRef, measuringRef, samplesRef, startTsRef, lastVideoTimeRef, lastUiRef, stoppedRef, durationMsRef, onDone, onFrameUi, onQuality }) {
  let rafId = 0
  const loop = () => {
    if (stoppedRef.current) return
    const video = videoRef.current
    if (landmarkerRef.current && video && video.readyState >= 2) {
      const videoTime = video.currentTime
      if (videoTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = videoTime
        try {
          const result = landmarkerRef.current.detectForVideo(video, performance.now())
          const landmarks = result?.landmarks?.[0] || null
          // ซิงก์ขนาด canvas กับเฟรมวิดีโอจริง — จุดอ้างอิงจะได้ทับภาพตรงตำแหน่งทุก aspect ratio ของกล้อง
          const overlayCanvas = canvasRef.current
          if (overlayCanvas && video.videoWidth > 0 &&
            (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight)) {
            overlayCanvas.width = video.videoWidth
            overlayCanvas.height = video.videoHeight
          }
          drawShoulderOverlay(canvasRef.current, landmarks)
          const now = performance.now()
          if (now - lastQualityCheckRef.current >= 500) {
            try {
              const qualityCanvas = qualityCanvasRef.current
              const qualityContext = qualityCanvas?.getContext('2d', { willReadFrequently: true })
              if (qualityCanvas && qualityContext) {
                qualityCanvas.width = 64
                qualityCanvas.height = 48
                qualityContext.drawImage(video, 0, 0, qualityCanvas.width, qualityCanvas.height)
                const analysis = analyzeCameraFrame(qualityContext.getImageData(0, 0, qualityCanvas.width, qualityCanvas.height), landmarks, previousFrameRef.current)
                previousFrameRef.current = analysis.sampledFrame
                onQuality({ status: analysis.status, issues: analysis.issues, torsoVisible: analysis.torsoVisible, distanceStatus: analysis.distanceStatus })
              }
            } catch {
              onQuality({ status: 'warning', issues: ['ตรวจคุณภาพภาพไม่ได้ กรุณาจัดกล้องใหม่แล้วลองอีกครั้ง'], torsoVisible: false, distanceStatus: 'unknown' })
            }
            lastQualityCheckRef.current = now
          }
          if (measuringRef.current) {
            const y = extractShoulderY(landmarks)
            const elapsed = performance.now() - startTsRef.current
            if (y !== null) samplesRef.current.push({ t: elapsed, y })
            if (elapsed >= durationMsRef.current) {
              measuringRef.current = false
              onDone()
              return
            }
            if (now - lastUiRef.current > 200) {
              lastUiRef.current = now
              onFrameUi(elapsed, samplesRef.current.length, y === null)
            }
          }
        } catch { /* ข้าม frame ที่ผิดพลาด */ }
      }
    }
    if (!stoppedRef.current) rafId = requestAnimationFrame(loop)
  }
  return {
    start: () => loop(),
    stop: () => cancelAnimationFrame(rafId),
  }
}

export default function BreathingRateCheck() {
  const navigate = useNavigate()
  const cameraSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const secureContext = typeof window !== 'undefined' && window.isSecureContext
  const [status, setStatus] = useState('idle') // idle | camera-requesting | camera-denied | model-error | ready | measuring | done
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [permissionState, setPermissionState] = useState(cameraSupported && secureContext ? 'not_requested' : 'unavailable')
  const [cameraErrorMessage, setCameraErrorMessage] = useState('ตรวจสิทธิ์กล้องและลองอีกครั้ง')
  const [cameraQuality, setCameraQuality] = useState({ status: 'checking', issues: [], torsoVisible: false, distanceStatus: 'unknown' })
  const [bpm, setBpm] = useState(null)
  const [remainingMs, setRemainingMs] = useState(MEASURE_DURATION_MS)
  const [sampleCount, setSampleCount] = useState(0)
  const [shoulderHint, setShoulderHint] = useState(false)
  const [qualityInterruption, setQualityInterruption] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false) // กล้องบางตัวใช้เวลาเริ่มส่ง frame — ปุ่มวัดต้องรอจนเล่นได้จริง
  const [videoReady, setVideoReady] = useState(false)
  const [mode, setMode] = useState('live') // 'live' = กล้องสด | 'upload' = อัปโหลดคลิปวิดีโอ
  const [, setUploadFileName] = useState('') // ชื่อไฟล์ไม่ถูกแสดงใน UI — ใช้เฉพาะ setter ตอนรีเซ็ต/เลือกคลิป
  const [uploadError, setUploadError] = useState('')
  const [uploadUrl, setUploadUrl] = useState('')
  const [resultUnreliable, setResultUnreliable] = useState(false)
  const [sampleMode, setSampleMode] = useState(false)
  const [riskAnswers, setRiskAnswers] = useState({})
  const [riskResult, setRiskResult] = useState(null)
  const uploadUrlRef = useRef(null)
  const durationMsRef = useRef(MEASURE_DURATION_MS)
  const [durationMs, setDurationMs] = useState(MEASURE_DURATION_MS) // มิเรอร์ของ durationMsRef เพื่อคำนวณ progress ใน render โดยไม่อ่าน ref ระหว่าง render
  // จุดเดียวที่เปลี่ยนความยาวการวัด — อัปเดตทั้ง ref (ให้ vision loop อ่านค่าล่าสุดเสมอ) และ state (ให้ progress bar render ถูกต้อง)
  function setMeasureDuration(ms) {
    durationMsRef.current = ms
    setDurationMs(ms)
  }
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const qualityCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const visionLoopRef = useRef(null)
  const measuringRef = useRef(false)
  const stoppedRef = useRef(false)
  const samplesRef = useRef([])
  const startTsRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const lastUiRef = useRef(0)
  const previousFrameRef = useRef(null)
  const lastQualityCheckRef = useRef(0)

  const stopCamera = () => {
    stoppedRef.current = true
    measuringRef.current = false
    visionLoopRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  // ผูก stream กับ video element หลังจาก element ถูก render (status เข้าสู่ ready/measuring/done)
  // — ตอน getUserMedia สำเร็จ video ยังไม่อยู่ใน DOM จึงต้อง attach ทีหลัง (บั๊กที่พบจริงตอนทดสอบ)
  useEffect(() => {
    if (mode !== 'live') return
    if ((status === 'ready' || status === 'measuring' || status === 'done') && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current
        videoRef.current.play().catch(() => { /* autoplay block ไม่กระทบ */ })
      }
    }
  }, [status, mode])

  useEffect(() => () => {
    stoppedRef.current = true
    stopCamera()
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current)
    closePoseLandmarker(landmarkerRef.current)
  }, [])

  const finishMeasurement = () => {
    measuringRef.current = false
    const result = computeBreathingRate(samplesRef.current)
    const rawBpm = result?.bpm ?? null
    // ช่วงสมเหตุสมผล 6–40 ครั้ง/นาที — นอกช่วง (หรือ null) ถือว่าสัญญาณไม่น่าเชื่อถือ
    const reliable = rawBpm !== null && rawBpm >= 6 && rawBpm <= 40
    setBpm(reliable ? rawBpm : null)
    setResultUnreliable(!reliable)
    setRemainingMs(0)
    setStatus('done')
  }

  const handleFrameUi = (elapsed, sampleCountNow, shoulderMissing) => {
    setRemainingMs(Math.max(0, durationMsRef.current - elapsed))
    setSampleCount(sampleCountNow)
    setShoulderHint(shoulderMissing)
  }

  const startVision = () => {
    stoppedRef.current = false
    visionLoopRef.current?.stop()
    visionLoopRef.current = createVisionLoop({
      landmarkerRef, videoRef, canvasRef, qualityCanvasRef, previousFrameRef, lastQualityCheckRef, measuringRef, samplesRef, startTsRef, lastVideoTimeRef, lastUiRef, stoppedRef,
      durationMsRef,
      onDone: () => finishMeasurement(),
      onFrameUi: handleFrameUi,
      onQuality: (nextQuality) => {
        if (measuringRef.current && nextQuality.status !== 'ready') {
          measuringRef.current = false
          samplesRef.current = []
          setBpm(null)
          setSampleCount(0)
          setQualityInterruption(true)
          setStatus('ready')
        }
        setCameraQuality((current) => (
          current.status === nextQuality.status &&
          current.torsoVisible === nextQuality.torsoVisible &&
          current.distanceStatus === nextQuality.distanceStatus &&
          current.issues.join('|') === nextQuality.issues.join('|')
            ? current
            : nextQuality
        ))
      },
    })
    visionLoopRef.current.start()
  }

  // ปุ่มเริ่ม: ขอกล้อง → โหลดโมเดล → ready (preview) — แยก error กล้อง/โมเดลชัดเจน
  const handleStart = async () => {
    if (!consentAccepted) return
    const secureContext = typeof window !== 'undefined' && window.isSecureContext
    if (!navigator.mediaDevices?.getUserMedia || !secureContext) {
      setPermissionState('unavailable')
      setCameraErrorMessage('เบราว์เซอร์หรือการเชื่อมต่อนี้ไม่พร้อมใช้กล้อง ต้องใช้เบราว์เซอร์ที่รองรับผ่าน HTTPS หรือ localhost')
      setStatus('camera-denied')
      return
    }
    // StrictMode รัน effect cleanup ครั้งแรกแล้วเซ็ต stoppedRef = true ค้าง — ต้องรีเซ็ตก่อนเริ่มลูปใหม่
    stoppedRef.current = false
    previousFrameRef.current = null
    lastQualityCheckRef.current = 0
    setCameraQuality({ status: 'checking', issues: [], torsoVisible: false, distanceStatus: 'unknown' })
    setStatus('camera-requesting')
    setPermissionState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
      streamRef.current = stream
      setPermissionState('granted')
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (streamRef.current !== stream) return
          stopCamera()
          setVideoPlaying(false)
          setVideoReady(false)
          setPermissionState('unavailable')
          setCameraErrorMessage('กล้องหยุดส่งภาพระหว่างใช้งาน กรุณาตรวจกล้องและลองใหม่อีกครั้ง')
          setStatus('camera-denied')
        }, { once: true })
      })
    } catch (error) {
      const knownErrors = {
        NotAllowedError: 'ไม่ได้รับอนุญาตให้ใช้กล้อง ตรวจสิทธิ์กล้องของเว็บไซต์แล้วลองอีกครั้ง',
        NotFoundError: 'ไม่พบกล้องที่ใช้งานได้บนอุปกรณ์นี้',
        NotReadableError: 'กล้องอาจกำลังถูกแอปอื่นใช้งานอยู่ ปิดแอปนั้นแล้วลองอีกครั้ง',
        SecurityError: 'กล้องต้องใช้ผ่าน HTTPS หรือ localhost และเบราว์เซอร์ที่รองรับ',
      }
      setCameraErrorMessage(knownErrors[error?.name] || 'เปิดกล้องไม่ได้ ตรวจการเชื่อมต่อและสิทธิ์กล้อง แล้วลองอีกครั้ง')
      setPermissionState(error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError' ? 'denied' : 'unavailable')
      setStatus('camera-denied')
      return
    }
    try {
      landmarkerRef.current = await loadPoseLandmarker()
      setStatus('ready')
      startVision()
    } catch {
      stopCamera()
      setStatus('model-error')
    }
  }

  const startMeasurement = () => {
    if (!videoPlaying || !videoReady || cameraQuality.status !== 'ready') return
    samplesRef.current = []
    startTsRef.current = performance.now()
    lastVideoTimeRef.current = -1
    lastUiRef.current = 0
    measuringRef.current = true
    setRemainingMs(durationMsRef.current)
    setSampleCount(0)
    setBpm(null)
    setResultUnreliable(false)
    setRiskResult(null)
    setShoulderHint(false)
    setQualityInterruption(false)
    setStatus('measuring')
  }

  const retryQualityCheck = () => {
    previousFrameRef.current = null
    lastQualityCheckRef.current = 0
    setCameraQuality({ status: 'checking', issues: [], torsoVisible: false, distanceStatus: 'unknown' })
  }

  const stopAndRevokeConsent = () => {
    stopCamera()
    if (uploadUrlRef.current) {
      URL.revokeObjectURL(uploadUrlRef.current)
      uploadUrlRef.current = null
    }
    setUploadUrl('')
    setUploadFileName('')
    setUploadError('')
    setSampleMode(false)
    setResultUnreliable(false)
    setRiskResult(null)
    setRiskAnswers({})
    setMeasureDuration(MEASURE_DURATION_MS)
    closePoseLandmarker(landmarkerRef.current)
    landmarkerRef.current = null
    setVideoPlaying(false)
    setVideoReady(false)
    setConsentAccepted(false)
    setPermissionState('not_requested')
    setCameraQuality({ status: 'checking', issues: [], torsoVisible: false, distanceStatus: 'unknown' })
    setStatus('idle')
  }

  // สลับโหมด: หยุดทุกอย่างที่กำลังทำ (กล้อง/คลิป/โมเดล) แล้วกลับสู่ idle ของโหมดใหม่
  const switchMode = (next) => {
    if (next === mode) return
    stopCamera()
    visionLoopRef.current?.stop()
    if (uploadUrlRef.current) {
      URL.revokeObjectURL(uploadUrlRef.current)
      uploadUrlRef.current = null
    }
    setUploadUrl('')
    setUploadFileName('')
    setUploadError('')
    setSampleMode(false)
    setResultUnreliable(false)
    setRiskResult(null)
    setRiskAnswers({})
    setMeasureDuration(MEASURE_DURATION_MS)
    measuringRef.current = false
    stoppedRef.current = true
    closePoseLandmarker(landmarkerRef.current)
    landmarkerRef.current = null
    setBpm(null)
    setSampleCount(0)
    setRemainingMs(MEASURE_DURATION_MS)
    setVideoPlaying(false)
    setVideoReady(false)
    setShoulderHint(false)
    setQualityInterruption(false)
    setCameraQuality({ status: 'checking', issues: [], torsoVisible: false, distanceStatus: 'unknown' })
    setConsentAccepted(false)
    setPermissionState('not_requested')
    setCameraErrorMessage('ตรวจสิทธิ์กล้องและลองอีกครั้ง')
    setStatus('idle')
    setMode(next)
  }

  const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

  // โหมด Demo: ใช้คลิปตัวอย่างในเครื่อง (public/demo/sample-breathing.mp4) — เผื่อกล้อง/เน็ตมีปัญหาวันแข่ง
  const handleDemoClick = async () => {
    setUploadError('')
    try {
      const probe = await fetch(SAMPLE_CLIP_URL, { method: 'HEAD' })
      if (!probe.ok) {
        setUploadError('ยังไม่มีคลิปตัวอย่างในเครื่อง — วางไฟล์ไว้ที่ frontend/public/demo/sample-breathing.mp4 แล้วลองใหม่')
        return
      }
      setStatus('upload-preparing')
      landmarkerRef.current = await loadPoseLandmarker()
      if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current)
      uploadUrlRef.current = null
      setMeasureDuration(MEASURE_DURATION_MS)
      setUploadUrl(SAMPLE_CLIP_URL)
      setUploadFileName('คลิปตัวอย่าง (Demo)')
      setSampleMode(true)
      stoppedRef.current = false
      previousFrameRef.current = null
      lastQualityCheckRef.current = 0
      setCameraQuality({ status: 'checking', issues: [], torsoVisible: false, distanceStatus: 'unknown' })
      setVideoReady(false)
      setVideoPlaying(false)
      setBpm(null)
      setResultUnreliable(false)
      setShoulderHint(false)
      setQualityInterruption(false)
      setStatus('ready')
      startVision()
    } catch {
      setUploadError('โหลดโมเดลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่')
      setStatus('idle')
    }
  }

  // อัปโหลดคลิป: ตรวจไฟล์ → โหลดโมเดลเดียวกับโหมดสด → สร้าง objectURL (ประมวลผลในเบราว์เซอร์เท่านั้น)
  const handleFileSelected = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setUploadError('ไฟล์ต้องเป็นวิดีโอ (เช่น mp4, webm, mov)')
      event.target.value = ''
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('ไฟล์ใหญ่เกิน 200 MB — กรุณาตัดคลิปให้สั้นลงแล้วลองใหม่')
      event.target.value = ''
      return
    }
    setUploadError('')
    setStatus('upload-preparing')
    try {
      landmarkerRef.current = await loadPoseLandmarker()
    } catch {
      setStatus('model-error')
      return
    }
    if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current)
    const url = URL.createObjectURL(file)
    uploadUrlRef.current = url
    setMeasureDuration(MEASURE_DURATION_MS)
    setUploadUrl(url)
    setUploadFileName(file.name)
    stoppedRef.current = false
    previousFrameRef.current = null
    lastQualityCheckRef.current = 0
    setCameraQuality({ status: 'checking', issues: [], torsoVisible: false, distanceStatus: 'unknown' })
    setVideoReady(false)
    setVideoPlaying(false)
    setBpm(null)
    setShoulderHint(false)
    setQualityInterruption(false)
    setStatus('ready')
    startVision()
  }

  const progressPct = Math.min(100, Math.max(0, Math.round(((durationMs - remainingMs) / Math.max(durationMs, 1)) * 100)))
  const canShowConsent = ['idle', 'camera-denied', 'model-error'].includes(status)
  const liveGuide = status === 'measuring'
    ? 'กำลังวัด — นั่งนิ่ง หายใจตามธรรมชาติ และงดพูด'
    : qualityInterruption && cameraQuality.status === 'warning'
      ? 'หยุดการวัดเพราะภาพ/การเคลื่อนไหวไม่พร้อม แก้ตามคำแนะนำแล้วเริ่มใหม่'
    : cameraQuality.distanceStatus === 'too_far'
      ? 'ขยับเข้าใกล้กล้องอีกนิด'
      : cameraQuality.distanceStatus === 'too_close'
        ? 'ขยับออกห่างกล้องอีกนิด'
        : cameraQuality.issues[0] || 'นั่งตัวตรง หันช่วงอกเข้ากล้อง และจัดให้เห็นไหล่กับลำตัวส่วนบน'

  return (
    <main className="br-page">
      <div className="br-shell">
        <div className="br-topbar">
          <button type="button" className="br-back" onClick={() => navigate(-1)}>← กลับ</button>
          <PageMenuButton />
        </div>

        <div className="resp-warning-banner" role="note">
          <WarningIcon />
          <span>{DISCLAIMER}</span>
        </div>

        <header className="br-header">
          <div className="br-header-icon" aria-hidden="true">
            <CameraGlyph />
          </div>
          <div className="br-header-text">
            <h1>ตรวจอัตราการหายใจด้วยกล้อง</h1>
            <p>ต้นแบบนี้ประมาณการเคลื่อนไหวจากภาพ ไม่ใช่การคัดกรองหรือวินิจฉัยโรค</p>
          </div>
          <aside className="br-header-tips">
            <p className="br-tips-title"><BulbGlyph /> {mode === 'upload' ? 'แนะนำการเลือกคลิป' : 'ตั้งกล้องให้พร้อม'}</p>
            {(mode === 'upload'
              ? ['เลือกคลิปที่ถ่ายไว้ ระบบประมวลผลทีละเฟรมในเบราว์เซอร์', 'ประมาณอัตราการหายใจจากช่วงต้นคลิป (สูงสุด 30 วินาที)', 'คลิปแนวตั้ง เห็นไหล่–ลำตัวชัด แสงพอดี']
              : ['นั่งนิ่ง วางกล้องให้อยู่ระดับลำตัว หันช่วงอกเข้ากล้อง', 'หายใจตามธรรมชาติ ให้เห็นไหล่และลำตัวส่วนบนชัดเจน', 'ต้องการแสงสว่างเพียงพอ ไม่มืดหรือสว่างจ้าเกินไป']
            ).map((tip) => (
              <p key={tip} className="br-tip-row"><CheckGlyph /> {tip}</p>
            ))}
          </aside>
        </header>

        <div className="resp-mode-toggle" role="tablist" aria-label="เลือกโหมดการตรวจ">
          <button type="button" role="tab" aria-selected={mode === 'live'} className={mode === 'live' ? 'active' : ''} onClick={() => switchMode('live')}>
            <CameraGlyph size={16} /> กล้องสด
          </button>
          <button type="button" role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'active' : ''} onClick={() => switchMode('upload')}>
            <ClipGlyph size={16} /> อัปโหลดคลิปวิดีโอ
          </button>
        </div>

        <div className="br-grid">
          {/* ===== คอลัมน์ซ้าย: ความยินยอม + การใช้งาน ===== */}
          <div className="br-col-main">
            {canShowConsent && mode === 'live' && cameraSupported && secureContext && (
              <div className="resp-consent-card" id="camera-privacy-notice">
                <ShieldGlyph />
                <div style={{ flex: 1 }}>
                  <strong>ก่อนเปิดกล้อง — ความเป็นส่วนตัวและความยินยอม</strong>
                  <p>เฟรมวิดีโอประมวลผลในเบราว์เซอร์และไม่ถูกส่งไป Backend หรือบันทึกเป็นไฟล์ — ไลบรารีและโมเดลโหลดจากไฟล์ในเครื่อง (public/mediapipe) จึงทำงานออฟไลน์ได้</p>
                  <label className="br-consent-label">
                    <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
                    <span>ฉันรับทราบการใช้กล้องและรายละเอียดข้างต้น และยินยอมให้ประมวลผลภาพในเบราว์เซอร์เพื่อการสาธิต</span>
                  </label>
                </div>
              </div>
            )}

            {canShowConsent && mode === 'upload' && (
              <div className="resp-consent-card" id="upload-privacy-notice">
                <ShieldGlyph />
                <div style={{ flex: 1 }}>
                  <strong>ก่อนอัปโหลดคลิป — ความเป็นส่วนตัวและความยินยอม</strong>
                  <p>คลิปของคุณประมวลผลในเบราว์เซอร์เท่านั้น ไม่ถูกส่งขึ้นเซิร์ฟเวอร์หรือบันทึกเป็นไฟล์ — ไลบรารีและโมเดลโหลดจากไฟล์ในเครื่อง เช่นเดียวกับโหมดกล้องสด</p>
                  <label className="br-consent-label">
                    <input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} />
                    <span>ฉันรับทราบและยินยอมให้ประมวลผลคลิปของฉันในเบราว์เซอร์เพื่อการสาธิต</span>
                  </label>
                </div>
              </div>
            )}

            {mode === 'upload' && status === 'idle' && (
              <div className="resp-dropzone">
                <button type="button" className="resp-play-circle" disabled={!consentAccepted} onClick={() => document.getElementById('br-file-input')?.click()} aria-label="เลือกไฟล์วิดีโอ">
                  <ClipGlyph size={22} />
                </button>
                <p className="resp-dropzone-text">เลือกคลิปวิดีโอจากเครื่องของคุณ</p>
                <div className="resp-dropzone-actions">
                  <button type="button" className="resp-btn-outline" disabled={!consentAccepted} onClick={() => document.getElementById('br-file-input')?.click()}>
                    เลือกไฟล์วิดีโอ
                  </button>
                  <button type="button" className="resp-btn-outline" disabled={!consentAccepted} onClick={handleDemoClick}>
                    ใช้คลิปตัวอย่าง (โหมด Demo)
                  </button>
                </div>
                <label className="br-file-hidden">
                  <input id="br-file-input" type="file" accept="video/*" onChange={handleFileSelected} disabled={!consentAccepted} />
                </label>
                <p className="resp-dropzone-hint">รองรับ MP4, WebM, MOV · ขนาดไม่เกิน 200 MB</p>
                <small className="br-hint">แนะนำคลิป 10–30 วินาที ถ่ายแนวตั้ง เห็นช่วงไหล่–ลำตัวชัด — ระบบวัดจากช่วงต้นคลิปสูงสุด 30 วินาที</small>
                {uploadError && <div className="br-error" role="alert">{uploadError}</div>}
              </div>
            )}
            {status === 'upload-preparing' && <div className="br-note" role="status">กำลังโหลดโมเดล pose… กรุณารอสักครู่</div>}

            {mode === 'live' && status === 'idle' && (cameraSupported
              ? secureContext
                ? <div className="resp-cam-request">
                    <div className="resp-cam-request-icon" aria-hidden="true"><CameraGlyph size={22} /></div>
                    <strong>ยินยอมและเปิดกล้อง</strong>
                    <p>กดปุ่มด้านล่างเพื่อขอสิทธิ์กล้อง โหลดโมเดล pose แล้วเข้าสู่หน้าจัดภาพก่อนเริ่มวัด</p>
                    <button type="button" className="resp-btn-primary resp-btn-wide" onClick={handleStart} disabled={!consentAccepted}>ยินยอมและเปิดกล้อง</button>
                    {!consentAccepted && <p className="resp-dropzone-hint">ต้องติ๊กยินยอมด้านบนก่อนจึงกดได้</p>}
                  </div>
                : <div className="br-plain-fallback">กล้องต้องใช้ผ่าน HTTPS หรือ localhost จึงจะเปิดได้</div>
              : <div className="br-plain-fallback">เบราว์เซอร์นี้ไม่รองรับกล้อง หรือไม่ได้อยู่ในบริบทที่ปลอดภัย จึงเปิดฟีเจอร์นี้ไม่ได้</div>)}
            {mode === 'live' && status === 'camera-requesting' && <div className="br-note" role="status">สถานะสิทธิ์: {permissionState} · กำลังขอสิทธิ์กล้องและโหลดโมเดล กรุณาเลือกอนุญาตในเบราว์เซอร์</div>}
            {mode === 'live' && status === 'camera-denied' && (
              <div className="br-error" role="alert">
                <strong>ยังเข้าถึงกล้องไม่ได้</strong>
                <span>{cameraErrorMessage} (สถานะ: {permissionState})</span>
                {cameraSupported && secureContext && <button type="button" className="resp-btn-primary" onClick={handleStart} disabled={!consentAccepted}>ลองขอสิทธิ์อีกครั้ง</button>}
              </div>
            )}
            {status === 'model-error' && (
              <div className="br-plain-fallback" role="alert">
                โหลดโมเดลไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่ได้
                {mode === 'live'
                  ? <button type="button" className="resp-btn-outline" onClick={handleStart} disabled={!consentAccepted}>ลองโหลดใหม่</button>
                  : <button type="button" className="resp-btn-outline" onClick={() => setStatus('idle')}>กลับไปเลือกไฟล์ใหม่</button>}
              </div>
            )}

            {['ready', 'measuring', 'done'].includes(status) && (
              <div className="br-video-wrap">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  src={mode === 'upload' ? uploadUrl : undefined}
                  onLoadedMetadata={(event) => {
                    const el = event.currentTarget
                    if (mode === 'upload') {
                      const raw = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : NaN
                      if (Number.isFinite(raw) && raw > 0 && raw < 5000) {
                        // fallback: คลิปสั้นกว่า 5 วินาที — สัญญาณไม่พอวิเคราะห์
                        setUploadError('คลิปสั้นกว่า 5 วินาที กรุณาใช้คลิปยาวอย่างน้อย 5 วินาที')
                        setStatus('idle')
                        return
                      }
                      setMeasureDuration(Number.isFinite(raw) && raw > 0 ? Math.min(MEASURE_DURATION_MS, Math.max(5000, raw)) : MEASURE_DURATION_MS)
                    }
                    setVideoReady(isVideoFrameReady(el))
                  }}
                  onError={() => {
                    if (mode === 'upload') {
                      setUploadError('เปิดหรือถอดรหัสวิดีโอไม่สำเร็จ — ไฟล์อาจเสียหายหรือเบราว์เซอร์ไม่รองรับ codec นี้ ลองไฟล์อื่น')
                      setStatus('idle')
                    }
                  }}
                  onCanPlay={(event) => setVideoReady(isVideoFrameReady(event.currentTarget))}
                  onPlaying={(event) => {
                    const ready = isVideoFrameReady(event.currentTarget)
                    setVideoReady(ready)
                    setVideoPlaying(ready)
                  }}
                  onEnded={() => { if (mode === 'upload' && measuringRef.current) finishMeasurement() }}
                  aria-label={mode === 'upload' ? 'คลิปวิดีโอที่เลือก' : 'ภาพตัวอย่างจากกล้อง'}
                />
                <canvas ref={canvasRef} width={640} height={480} aria-hidden="true" />
              </div>
            )}

            {status === 'measuring' && (
              <div className="br-measure-block">
                <div className="br-countdown">เหลือ {Math.ceil(remainingMs / 1000)} วินาที</div>
                <div className="br-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}>
                  <div className="br-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
                <p className="br-hint">{shoulderHint ? 'มองไม่เห็นไหล่ชัด ลองหันช่วงอกเข้ากล้องและจัดเฟรมใหม่' : `หายใจตามธรรมชาติ กำลังเก็บข้อมูล (${sampleCount} จุด)`}</p>
              </div>
            )}
            {status === 'done' && (
              <div className="br-result">
                <strong>{bpm === null ? (resultUnreliable ? 'วัดไม่ได้ ลองใหม่' : 'ไม่สามารถประมาณค่าได้') : `~${bpm} ครั้ง/นาที`}</strong>
                <small>{bpm === null
                  ? (resultUnreliable ? 'สัญญาณไม่น่าเชื่อถือ (ขยับมาก/สัญญาณรบกวน) — นั่งนิ่งกว่าแล้ววัดใหม่' : 'มองไม่เห็นไหล่ชัดพอ ลองจัดเฟรมแล้ววัดใหม่')
                  : 'ค่าประมาณจากการเคลื่อนไหวในวิดีโอเท่านั้น ไม่ใช่ค่าทางการแพทย์'}</small>
                <button type="button" className="resp-btn-outline" onClick={() => { setBpm(null); setResultUnreliable(false); setRiskResult(null); setStatus('ready'); retryQualityCheck() }}>วัดใหม่</button>
              </div>
            )}

            {['ready', 'measuring', 'done'].includes(status) && (
              <button type="button" className="br-stop-button" onClick={stopAndRevokeConsent}>
                {mode === 'upload' ? 'ลบคลิปและถอนความยินยอม' : 'หยุดกล้องและถอนความยินยอม'}
              </button>
            )}
          </div>

          {/* ===== คอลัมน์ขวา: สถานะคุณภาพภาพ + หมายเหตุโหมด Demo ===== */}
          <aside className="br-col-side">
            {['idle', 'camera-denied', 'model-error', 'upload-preparing'].includes(status) && (
              <div className="br-steps-card">
                <h3>ขั้นตอนการใช้งาน</h3>
                <ol className="br-steps-list">
                  <li>ติ๊กยินยอมความเป็นส่วนตัวด้านซ้าย</li>
                  <li>{mode === 'upload' ? 'เลือกไฟล์คลิป หรือใช้คลิปตัวอย่าง' : 'กด "ยินยอมและเปิดกล้อง" เพื่อขอสิทธิ์กล้อง'}</li>
                  <li>จัดภาพให้เห็นไหล่–ลำตัวส่วนบนจนระบบบอกว่าภาพพร้อม</li>
                  <li>กดเริ่มวัด แล้วหายใจตามธรรมชาติ 30 วินาที</li>
                  <li>อ่านผลประมาณการ + กรอกแบบประเมินปัจจัยเสี่ยง</li>
                </ol>
              </div>
            )}
            {['ready', 'measuring', 'done'].includes(status) && (
              <div className={`br-quality br-quality--${cameraQuality.status}`} role="status" aria-live="polite">
                <h3>{cameraQuality.status === 'checking' ? 'กำลังตรวจภาพเบื้องต้น…' : cameraQuality.status === 'ready' ? 'ภาพพร้อมสำหรับการสาธิตเบื้องต้น' : 'ภาพยังไม่พร้อมสำหรับการวัด'}</h3>
                <p className="br-live-guide">{liveGuide}</p>
                {cameraQuality.issues.length > 0
                  ? <ul className="br-issue-list">{cameraQuality.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                  : cameraQuality.status === 'ready' && <p className="br-quality-note">ตรวจแสง รายละเอียดภาพ การเปลี่ยนแปลงของเฟรม และการเห็นลำตัวส่วนบนแล้ว การตรวจนี้เป็นเพียง heuristic ไม่ใช่การยืนยันคุณภาพทางการแพทย์</p>}
                {status === 'ready' && cameraQuality.status === 'warning' && <button type="button" className="resp-btn-outline" onClick={retryQualityCheck}>ตรวจภาพอีกครั้ง</button>}
              </div>
            )}
            {['ready', 'measuring', 'done'].includes(status) && sampleMode && (
              <div className="br-note" role="status">โหมดตัวอย่าง (Demo): ผลลัพธ์มาจากคลิปตัวอย่างในเครื่อง ไม่ใช่การวัดสด</div>
            )}
            {status === 'ready' && (
              <div className="br-next-step">
                <p className="br-tips-title"><CheckGlyph /> ขั้นถัดไป</p>
                <p className="br-next-step-text">เมื่อภาพพร้อมแล้ว กด "เริ่มวัด 30 วินาที" เพื่อเริ่มเก็บสัญญาณการหายใจ</p>
              </div>
            )}
            {status === 'ready' && (
              <button type="button" className="resp-btn-primary resp-btn-wide" onClick={startMeasurement} disabled={!videoPlaying || cameraQuality.status !== 'ready'}>
                {!videoPlaying || !videoReady ? 'กำลังรอภาพจากกล้อง…' : cameraQuality.status !== 'ready' ? 'จัดภาพตามคำแนะนำก่อนเริ่ม' : 'เริ่มวัด 30 วินาที'}
              </button>
            )}
          </aside>
        </div>

        {status === 'done' && (
          <section className="br-risk-panel">
            <strong>แบบประเมินปัจจัยเสี่ยงเพิ่มเติม</strong>
            <p className="br-risk-note">ผลรวมไม่ตัดสินจากค่าอัตราการหายใจอย่างเดียว — กรอกปัจจัยเสี่ยงด้านล่างเพื่อดูระดับความเสี่ยงรวม</p>
            {RISK_QUESTIONS.map((question) => (
              <label key={question.id} className="br-risk-question">
                <input
                  type="checkbox"
                  checked={Boolean(riskAnswers[question.id])}
                  onChange={(event) => setRiskAnswers((current) => ({ ...current, [question.id]: event.target.checked }))}
                />
                <span>{question.label}</span>
              </label>
            ))}
            <button type="button" className="resp-btn-outline" onClick={() => setRiskResult(computeRiskLevel(riskAnswers))}>ประเมินระดับความเสี่ยง</button>
            {riskResult && (
              <div className="br-risk-result" role="status">
                <strong>ระดับความเสี่ยงจากแบบประเมิน: {riskResult.level}</strong>
                <p>{riskResult.advice}</p>
                <small>สรุปรวม: ค่าอัตราการหายใจ (ข้อมูลอ้างอิงเสริม) + ปัจจัยเสี่ยงจากแบบประเมิน — เป็นการคัดกรองเบื้องต้น ไม่ใช่การวินิจฉัยโรค หากมีอาการควรพบแพทย์</small>
              </div>
            )}
          </section>
        )}
        <canvas ref={qualityCanvasRef} className="br-quality-canvas" width={64} height={48} aria-hidden="true" />
      </div>
    </main>
  )
}

/* ─── Icons (inline SVG — เข้าธีมเว็บ ไม่ใช้อีโมจิ) ─── */
function WarningIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
}
function CameraGlyph({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>
}
function ClipGlyph({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
}
function BulbGlyph() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/></svg>
}
function CheckGlyph() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5L20 7"/></svg>
}
function ShieldGlyph() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5Z"/></svg>
}
