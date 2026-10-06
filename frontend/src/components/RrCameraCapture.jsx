import { useCallback, useEffect, useRef, useState } from 'react'
import { computeBreathingRate, extractShoulderY } from '../utils/breathingRate'
import { isVideoFrameReady } from '../utils/cameraQuality'
import {
  createQualityAccumulator,
  recordFrameMetrics,
  recordPoseFrame,
  computeFrameMetrics,
  buildQualityResult,
} from '../utils/signalQuality'

// คอมโพเนนต์ใหม่สำหรับระบบประเมินความเสี่ยงโรคทางเดินหายใจ (3 สัญญาณ)
// วัดอัตราการหายใจ (RR) จากจังหวะไหล่ด้วย MediaPipe PoseLandmarker (พรีเทรน) — pattern เดียวกับ
// BreathingRateCheck.jsx แต่แยกไฟล์เพื่อไม่แตะระบบเดิม และบันทึกคลิปจากกล้องพร้อมกัน (MediaRecorder)
// เพื่อส่งต่อให้ vitallens rPPG ที่ backend (/api/vital-signs)
// ผลลัพธ์เป็นข้อมูลคัดกรองเบื้องต้น ไม่ใช่ค่าทางการแพทย์

const TASKS_VISION_URL = '/mediapipe'
const POSE_MODEL_URL = '/mediapipe/pose_landmarker_lite.task'
const MEASURE_DURATION_MS = 30000
const LIGHT_WARNING = 'ต้องการแสงสว่างเพียงพอ เพื่อความแม่นยำ'

const landmarkerPromises = {}
function loadPoseLandmarker(delegate = 'GPU') {
  if (landmarkerPromises[delegate]) return landmarkerPromises[delegate]
  landmarkerPromises[delegate] = (async () => {
    const vision = await import(/* @vite-ignore */ `${TASKS_VISION_URL}/vision_bundle.mjs`)
    const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_VISION_URL}/wasm`)
    return vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })
  })().catch((error) => {
    delete landmarkerPromises[delegate]
    throw error
  })
  return landmarkerPromises[delegate]
}

const POSE_LOAD_TIMEOUT_MS = 12000

// ปิด landmarker แล้วต้องล้าง cache — ไม่งั้นการวัดครั้งถัดไปได้ instance ที่ถูก close() ไปแล้ว
function invalidateLandmarkerCache() {
  for (const key of Object.keys(landmarkerPromises)) delete landmarkerPromises[key]
}
async function loadPoseLandmarkerRobust() {
  try {
    return await Promise.race([
      loadPoseLandmarker('GPU'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('pose GPU load timeout')), POSE_LOAD_TIMEOUT_MS)),
    ])
  } catch {
    // GPU โหลดไม่ได้/ค้าง (WebGL ไม่พร้อม) — ลอง CPU ก่อนยอมแพ้ (RR จะขาดไปแต่ระบบยังทำงาน)
    try {
      return await Promise.race([
        loadPoseLandmarker('CPU'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('pose CPU load timeout')), POSE_LOAD_TIMEOUT_MS)),
      ])
    } catch {
      return null
    }
  }
}

function pickRecorderMime() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

function drawShoulderOverlay(canvas, landmarks) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!landmarks) return
  const points = [11, 12]
    .map((index) => landmarks[index])
    .filter((point) => point && (point.visibility ?? 1) >= 0.5)
  for (const point of points) {
    ctx.beginPath()
    ctx.arc(point.x * canvas.width, point.y * canvas.height, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#047857'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
}

export default function RrCameraCapture({ onRrResult, onVideoRecorded, onError, onCancel, enabled = false, registerStart, onStatusChange }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const qualityCanvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const rafRef = useRef(0)
  const samplesRef = useRef([])
  const startTsRef = useRef(0)
  const measuringRef = useRef(false)
  const lastVideoTimeRef = useRef(-1)
  const lastUiRef = useRef(0)
  const lastQualityCheckRef = useRef(0)
  const previousFrameRef = useRef(null)
  const stoppedRef = useRef(false)
  const qualityAccumulatorRef = useRef(createQualityAccumulator())
  const rafFramesRef = useRef(0)
  const processedFramesRef = useRef(0)
  const startTsWallRef = useRef(0)

  const [status, setStatus] = useState('idle') // idle | preparing | ready | measuring | done | error
  const [error, setError] = useState(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [qualityIssue, setQualityIssue] = useState(null)

  const stopEverything = useCallback(() => {
    stoppedRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    try { recorderRef.current?.state === 'recording' && recorderRef.current.stop() } catch { /* ข้าม */ }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (landmarkerRef.current) {
      try { landmarkerRef.current?.close?.() } catch { /* ข้าม */ }
      invalidateLandmarkerCache()
    }
    landmarkerRef.current = null
  }, [])

  useEffect(() => () => stopEverything(), [stopEverything])

  // Consent ถูกยกเลิกขณะวัด → หยุดกล้องและตัดการบันทึกทันที
  useEffect(() => {
    if (!enabled) {
      const wasMeasuring = measuringRef.current || status === 'measuring' || status === 'preparing'
      stopEverything()
      if (wasMeasuring) {
        setStatus('idle')
        setElapsedMs(0)
        onCancel?.('ยกเลิกความยินยอมแล้ว — กล้องถูกปิด')
      }
    }
  }, [enabled, status, stopEverything, onCancel])

  const cancel = useCallback(() => {
    stopEverything()
    chunksRef.current = [] // ยกเลิก = ทิ้งคลิปที่บันทึกค้าง ไม่ส่งให้ backend
    recorderRef.current = null
    setStatus('idle')
    setElapsedMs(0)
    onCancel?.('ยกเลิกการวัดแล้ว — กล้องถูกปิด คลิปที่บันทึกไม่ถูกส่ง')
  }, [onCancel, stopEverything])

  const finishMeasurement = useCallback(() => {
    measuringRef.current = false
    const rrRaw = computeBreathingRate(samplesRef.current)
    const rawBpm = rrRaw?.bpm ?? null
    const reliable = rawBpm !== null && rawBpm >= 6 && rawBpm <= 40
    const elapsedMs = performance.now() - startTsWallRef.current
    // Phase 2 — structured quality gate: คุณภาพไม่ผ่าน = ห้ามใช้ค่า
    const quality = buildQualityResult({
      accumulator: qualityAccumulatorRef.current,
      elapsedMs,
      requiredMs: MEASURE_DURATION_MS,
      processedFrames: processedFramesRef.current,
      rafFrames: rafFramesRef.current,
      rrResult: rrRaw,
    })
    let recorder = recorderRef.current
    const recordedChunks = chunksRef.current
    if (recorder?.state === 'recording') {
      recorder.stop()
    } else {
      // กรณี recorder ไม่พร้อม — แจ้งว่าสัญญาณ vitallens ขาดไป
      onVideoRecorded?.(null)
    }
    chunksRef.current = []
    setStatus('done')
    stopEverything()
    onRrResult?.({
      bpm: reliable && quality.canUseMeasurement ? rawBpm : null,
      rawBpm,
      reliable: reliable && quality.canUseMeasurement,
      sampleCount: samplesRef.current.length,
      elapsedMs,
      quality,
    })
    if (recordedChunks.length > 0) {
      const mime = recordedChunks[0].type || 'video/webm'
      onVideoRecorded?.(new Blob(recordedChunks, { type: mime }))
    } else {
      onVideoRecorded?.(null)
    }
  }, [onRrResult, onVideoRecorded, stopEverything])

  const start = useCallback(async () => {
    // Consent gate — ห้ามเรียก getUserMedia/MediaRecorder ก่อนยินยอม
    if (!enabled) {
      const message = 'ยังไม่ได้ให้ความยินยอมการใช้กล้อง'
      setError(message)
      onError?.(message)
      return
    }
    setError(null)
    setQualityIssue(null)
    setElapsedMs(0)
    samplesRef.current = []
    chunksRef.current = []
    stoppedRef.current = false
    qualityAccumulatorRef.current = createQualityAccumulator()
    rafFramesRef.current = 0
    processedFramesRef.current = 0
    setStatus('preparing')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
    } catch {
      const message = 'เปิดกล้องไม่ได้ (ไม่ได้ให้สิทธิ์ หรือไม่มีกล้อง) — ยังประเมินจากแบบประเมินอาการได้'
      setError(message)
      setStatus('error')
      onError?.(message)
      return
    }
    streamRef.current = stream
    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      await video.play().catch(() => {})
    }

    // เริ่มบันทึกคลิปสำหรับ vitallens (ถ้าเบราว์เซอร์รองรับ)
    try {
      const mime = pickRecorderMime()
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.start(1000)
      recorderRef.current = recorder
    } catch {
      recorderRef.current = null // vitallens จะขาดไป — หน้าผลรวมจะแจ้งสัญญาณที่ขาด
    }

    // โหลดโมเดล pose (ถ้าโหลดไม่ได้ ยังบันทึกวิดีโอให้ vitallens ต่อได้ แต่ RR จะขาด)
    landmarkerRef.current = await loadPoseLandmarkerRobust()

    setStatus('measuring')
    measuringRef.current = true
    startTsRef.current = performance.now()
    startTsWallRef.current = startTsRef.current
    lastVideoTimeRef.current = -1
    lastQualityCheckRef.current = 0

    const liveQualityHint = (metrics) => {
      // ข้อความระหว่างวัด (สรุปจากเมตริกล่าสุด — ผลตัดสินจริงอยู่ใน quality result ตอนจบ)
      if (metrics.brightness < 38) return 'ภาพมืดเกินไป เพิ่มแสงในห้อง'
      if (metrics.brightness > 225) return 'ภาพสว่างจ้าเกินไป'
      if (metrics.edgeDetail < 4) return 'ภาพอาจเบลอ'
      if (metrics.frameChange !== null && metrics.frameChange > 36) return 'ขยับตัว/พูดมาก กรุณานิ่ง ๆ'
      return null
    }

    const loop = () => {
      if (stoppedRef.current) return
      rafFramesRef.current += 1
      const currentVideo = videoRef.current
      const landmarker = landmarkerRef.current
      if (currentVideo && currentVideo.readyState >= 2 && isVideoFrameReady(currentVideo)) {
        if (currentVideo.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = currentVideo.currentTime
          if (landmarker) {
            try {
              const result = landmarker.detectForVideo(currentVideo, performance.now())
              const landmarks = result?.landmarks?.[0] || null
              landmarksCacheRef.current = landmarks
              drawShoulderOverlay(canvasRef.current, landmarks)
              processedFramesRef.current += 1
              if (measuringRef.current) {
                recordPoseFrame(qualityAccumulatorRef.current, extractShoulderY(landmarks) !== null)
              }
            } catch { /* ข้าม frame ที่ผิดพลาด */ }
          }
        }
        const now = performance.now()
        if (now - lastQualityCheckRef.current >= 500) {
          lastQualityCheckRef.current = now
          try {
            const qualityCanvas = qualityCanvasRef.current
            const qualityContext = qualityCanvas?.getContext('2d', { willReadFrequently: true })
            if (qualityCanvas && qualityContext) {
              qualityCanvas.width = 64
              qualityCanvas.height = 48
              qualityContext.drawImage(currentVideo, 0, 0, qualityCanvas.width, qualityCanvas.height)
              const metrics = computeFrameMetrics(
                qualityContext.getImageData(0, 0, qualityCanvas.width, qualityCanvas.height),
                previousFrameRef.current,
              )
              if (metrics) {
                previousFrameRef.current = metrics.sampledFrame
                if (measuringRef.current) recordFrameMetrics(qualityAccumulatorRef.current, metrics)
                setQualityIssue(liveQualityHint(metrics))
              }
            }
          } catch { /* ข้าม */ }
        }
        if (measuringRef.current && landmarker) {
          const y = extractShoulderY(landmarksCacheRef.current)
          const elapsed = performance.now() - startTsRef.current
          if (y !== null) samplesRef.current.push({ t: elapsed, y })
          if (elapsed >= MEASURE_DURATION_MS) {
            setElapsedMs(MEASURE_DURATION_MS)
            finishMeasurement()
            return
          }
          if (now - lastUiRef.current > 200) {
            lastUiRef.current = now
            setElapsedMs(elapsed)
          }
        }
      }
      if (!stoppedRef.current) rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [enabled, finishMeasurement, onError])

  // Additive (UI shell merge): ให้หน้าแม่เรียก start ผ่านปุ่มของตัวเอง + รู้สถานะไว้ปิดปุ่มซ้ำ — ไม่เปลี่ยน logic เดิม
  useEffect(() => {
    registerStart?.(start)
    return () => registerStart?.(null)
  }, [registerStart, start])
  useEffect(() => {
    onStatusChange?.(status)
  }, [onStatusChange, status])

  // เก็บ landmarks ล่าสุดไว้ใช้ในส่วนวัดของลูป
  const landmarksCacheRef = useRef(null)

  const secondsLeft = Math.max(0, Math.ceil((MEASURE_DURATION_MS - elapsedMs) / 1000))
  const progress = Math.min(100, (elapsedMs / MEASURE_DURATION_MS) * 100)

  return (
    <div className="rrisk-camera">
      <p className="rrisk-light-warning">⚠️ {LIGHT_WARNING} (ทั้งการวัด RR และ rPPG)</p>
      <div className="rrisk-camera-stage">
        <video ref={videoRef} playsInline muted className={status === 'measuring' ? 'is-live' : ''} />
        <canvas ref={canvasRef} className="rrisk-camera-overlay" />
      </div>
      <canvas ref={qualityCanvasRef} hidden />
      {status === 'measuring' && (
        <div className="rrisk-camera-progress" role="status">
          <span>กำลังวัด — เหลือ {secondsLeft} วินาที</span>
          <div className="rrisk-progress-bar"><span style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      {qualityIssue && <p className="rrisk-camera-quality">คุณภาพภาพ: {qualityIssue}</p>}
      {error && <p className="rrisk-error">{error}</p>}
      <div className="rrisk-camera-actions">
        {status !== 'measuring' && (
          <button
            type="button"
            className="rrisk-btn"
            onClick={start}
            disabled={status === 'preparing' || !enabled}
            title={!enabled ? 'ต้องให้ความยินยอมการใช้กล้องก่อน' : undefined}
          >
            {status === 'preparing' ? 'กำลังเตรียมกล้อง…' : status === 'done' ? 'วัดใหม่อีกครั้ง (30 วินาที)' : 'เริ่มวัดการหายใจ (30 วินาที)'}
          </button>
        )}
        {(status === 'measuring' || status === 'preparing') && (
          <button type="button" className="rrisk-btn rrisk-btn--cancel" onClick={cancel}>
            ยกเลิกการวัด (ปิดกล้อง)
          </button>
        )}
      </div>
    </div>
  )
}
