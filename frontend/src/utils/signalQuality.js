// Camera & Signal Quality Gate (Phase 2) — รวมผลตรวจ 9 ด้านเป็น structured result
// หลักการ: คุณภาพไม่พอ → canUseMeasurement = false และต้องไม่นำค่าไปเข้า scoring เป็นค่าปกติ
// เกณฑ์ brightness/edgeDetail(เบลอ)/frameChange(การขยับ) ใช้ค่าเดียวกับ utils/cameraQuality.js
// (38/225, 4, 36) เพื่อไม่ให้มีสองมาตรฐาน — ส่วน periodicity (≥0.35) และ interval CV (≤0.6)
// ใช้เกณฑ์เดียวกับ gate ภายในของ computeBreathingRate (ไม่แก้สูตร/ไม่แก้เกณฑ์ RR)
// Pure logic ไม่มี DOM/React — unit-testable with node --test

// เกณฑ์คงที่ (documented thresholds — ห้ามแก้เพื่อให้ test ผ่าน)
export const QUALITY_THRESHOLDS = {
  DURATION_MIN_RATIO: 0.9,        // ต้องวัดอย่างน้อย 90% ของระยะเวลาที่กำหนด
  POSE_VISIBILITY_PASS: 0.7,      // ≥70% ของเฟรมที่ประมวลผลต้องเห็นไหล่
  POSE_VISIBILITY_WARN: 0.5,
  BRIGHTNESS_MIN: 38,             // ค่าเดียวกับ cameraQuality.js
  BRIGHTNESS_MAX: 225,
  BRIGHTNESS_FAIL_RATIO: 0.3,     // >30% ของเฟรมตัวอย่างมืด/จ้าเกิน → fail
  BRIGHTNESS_WARN_RATIO: 0.1,
  BLUR_MIN: 4,                    // edgeDetail เฉลี่ย (ค่าเดียวกับ cameraQuality.js)
  BLUR_WARN: 6,
  FPS_MIN: 7,                     // เฟรมที่ประมวลผลได้ต่อวินาที (MediaPipe lite)
  FPS_WARN: 12,
  DROPPED_FAIL_RATIO: 0.35,       // สัดส่วนเฟรม rAF ที่ไม่ได้ประมวลผล
  DROPPED_WARN_RATIO: 0.15,
  MOTION_MAX: 36,                 // frameChange เฉลี่ย (ค่าเดียวกับ cameraQuality.js)
  MOTION_WARN: 24,
  MOTION_FAIL_RATIO: 0.3,         // >30% ของตัวอย่างขยับแรง → fail
  MOTION_WARN_RATIO: 0.1,
  PERIODICITY_PASS: 0.35,         // เกณฑ์เดียวกับ gate ใน breathingRate.js
  PERIODICITY_WARN: 0.25,
  INTERVAL_CV_PASS: 0.6,          // เกณฑ์เดียวกับ gate ใน breathingRate.js
  INTERVAL_CV_WARN: 0.8,
  HR_CONFIDENCE_MIN: 0.5,         // ต่ำกว่านี้ = HR ใช้ไม่ได้ (ขาดสัญญาณ)
  HR_CONFIDENCE_WARN: 0.75,
}

export const CLINICAL_ACCURACY_STATUS =
  'ยังไม่ได้รับการยืนยันทางคลินิก — ยังไม่ได้รับการตรวจสอบกับอุปกรณ์อ้างอิง (clinical accuracy: not established) ใช้เป็นข้อมูลประกอบเท่านั้น'

export const QUALITY_STATUS = {
  GOOD: 'good',                 // ไม่มี fail และไม่มี warning
  ACCEPTABLE: 'acceptable',     // มี warning แต่ไม่มี fail → ใช้ได้ + แสดงข้อควรระวัง
  INSUFFICIENT: 'insufficient', // มี fail → ห้ามใช้ค่า
}

// ---------- per-frame metrics (สูตรเดียวกับ cameraQuality.js เพื่อให้ตัวเลขเทียบกันได้) ----------
export function computeFrameMetrics(imageData, previousGray = null) {
  const { data, width, height } = imageData || {}
  if (!data || !Number.isInteger(width) || width < 3 || !Number.isInteger(height) || height < 3) return null
  const gray = new Uint8Array(width * height)
  let brightnessTotal = 0
  for (let pixel = 0; pixel < gray.length; pixel++) {
    const offset = pixel * 4
    gray[pixel] = Math.round((data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114))
    brightnessTotal += gray[pixel]
  }
  const brightness = brightnessTotal / gray.length
  let edgeTotal = 0
  let edgeSamples = 0
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = (y * width) + x
      const neighbors = (gray[index - 1] + gray[index + 1] + gray[index - width] + gray[index + width]) / 4
      edgeTotal += Math.abs(gray[index] - neighbors)
      edgeSamples++
    }
  }
  const edgeDetail = edgeSamples ? edgeTotal / edgeSamples : 0
  let frameChange = null
  if (previousGray?.length === gray.length) {
    let changeTotal = 0
    for (let i = 0; i < gray.length; i += 4) changeTotal += Math.abs(gray[i] - previousGray[i])
    frameChange = changeTotal / Math.ceil(gray.length / 4)
  }
  return { brightness, edgeDetail, frameChange, sampledFrame: gray }
}

// ---------- accumulator ----------
export function createQualityAccumulator() {
  return {
    brightness: [],
    edgeDetail: [],
    frameChange: [],
    poseFramesProcessed: 0,
    poseFramesVisible: 0,
  }
}

export function recordFrameMetrics(accumulator, metrics) {
  if (!accumulator || !metrics) return
  accumulator.brightness.push(metrics.brightness)
  accumulator.edgeDetail.push(metrics.edgeDetail)
  if (metrics.frameChange !== null) accumulator.frameChange.push(metrics.frameChange)
}

export function recordPoseFrame(accumulator, shoulderVisible) {
  if (!accumulator) return
  accumulator.poseFramesProcessed += 1
  if (shoulderVisible) accumulator.poseFramesVisible += 1
}

// ---------- ตัวช่วยคำนวณ ----------
function mean(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function ratioOf(values, predicate) {
  if (!values.length) return null
  return values.filter(predicate).length / values.length
}

/** Interval CV จากช่วงเวลาของ peaks (ms) — ค่าเดียวกับที่ breathingRate ใช้เป็น gate */
export function computeIntervalCv(peaks) {
  if (!Array.isArray(peaks) || peaks.length < 2) return null
  const intervals = []
  for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1])
  const meanInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
  if (meanInterval <= 0) return null
  const variance = intervals.reduce((sum, value) => sum + (value - meanInterval) ** 2, 0) / intervals.length
  return Math.sqrt(variance) / meanInterval
}

// ---------- checks ----------
const CHECK_STATUS = { PASS: 'pass', WARN: 'warn', FAIL: 'fail', NOT_RUN: 'not_run' }

function check(id, status, value, detail, failNote, warnNote) {
  return { id, status, value, detail, retryNote: status === CHECK_STATUS.FAIL ? failNote : status === CHECK_STATUS.WARN ? warnNote : null }
}

function assessDuration(elapsedMs, requiredMs) {
  const ratio = requiredMs > 0 ? elapsedMs / requiredMs : 0
  if (ratio < QUALITY_THRESHOLDS.DURATION_MIN_RATIO) {
    return check('duration', CHECK_STATUS.FAIL, Number(ratio.toFixed(2)),
      `วัดจริง ${Math.round(elapsedMs / 1000)} วินาที จากที่กำหนด ${Math.round(requiredMs / 1000)} วินาที`,
      'การวัดสั้นเกินไป (อาจหยุดกลางคัน) กรุณาวัดใหม่ครบ 30 วินาที', null)
  }
  return check('duration', CHECK_STATUS.PASS, Number(ratio.toFixed(2)), `วัดครบ ${Math.round(elapsedMs / 1000)} วินาที`, null, null)
}

function assessPoseVisibility(accumulator) {
  const processed = accumulator.poseFramesProcessed
  const ratio = processed > 0 ? accumulator.poseFramesVisible / processed : null
  if (ratio === null) {
    return check('poseVisibility', CHECK_STATUS.FAIL, null, 'ไม่มีเฟรมที่ประมวลผลได้เลย',
      'โมเดลไม่สามารถอ่านท่าทางได้ กรุณาลองใหม่ในที่แสงพอและอยู่ในเฟรม', null)
  }
  const percent = Math.round(ratio * 100)
  if (ratio < QUALITY_THRESHOLDS.POSE_VISIBILITY_WARN) {
    return check('poseVisibility', CHECK_STATUS.FAIL, percent, `เห็นไหล่เพียง ${percent}% ของเฟรม`,
      'ไหล่อยู่นอกเฟรมหรือถูกบังเกือบตลอด กรุณาจัดเฟรมให้เห็นไหล่ทั้งสองข้างและวัดใหม่', null)
  }
  if (ratio < QUALITY_THRESHOLDS.POSE_VISIBILITY_PASS) {
    return check('poseVisibility', CHECK_STATUS.WARN, percent, `เห็นไหล่ ${percent}% ของเฟรม`,
      null, 'ไหล่หลุดเฟรมบ่อย ควรนั่งนิ่งและจัดเฟรมให้เห็นไหล่ตลอดการวัด')
  }
  return check('poseVisibility', CHECK_STATUS.PASS, percent, `เห็นไหล่ ${percent}% ของเฟรม`, null, null)
}

function assessBrightness(accumulator) {
  const values = accumulator.brightness
  if (!values.length) return check('brightness', CHECK_STATUS.NOT_RUN, null, 'ไม่ได้เก็บตัวอย่างภาพ', 'ไม่สามารถตรวจแสงได้ กรุณาลองใหม่', null)
  const meanBrightness = mean(values)
  const outOfRange = ratioOf(values, (value) => value < QUALITY_THRESHOLDS.BRIGHTNESS_MIN || value > QUALITY_THRESHOLDS.BRIGHTNESS_MAX)
  const dark = ratioOf(values, (value) => value < QUALITY_THRESHOLDS.BRIGHTNESS_MIN)
  const rounded = Math.round(meanBrightness)
  if (outOfRange > QUALITY_THRESHOLDS.BRIGHTNESS_FAIL_RATIO) {
    return check('brightness', CHECK_STATUS.FAIL, rounded,
      `ความสว่างเฉลี่ย ${rounded} (${dark > 0.5 ? 'มืด' : 'สว่างจ้า'}เกินเกณฑ์ใน ${Math.round(outOfRange * 100)}% ของเวลา)`,
      dark * 2 >= outOfRange ? 'แสงไม่พอ กรุณาเพิ่มแสงในห้องแล้ววัดใหม่ — ต้องการแสงสว่างเพียงพอ เพื่อความแม่นยำ'
        : 'แสงจ้าเกินไป กรุณาหลีกเลี่ยงแสงย้อนแล้ววัดใหม่', null)
  }
  if (outOfRange > QUALITY_THRESHOLDS.BRIGHTNESS_WARN_RATIO) {
    return check('brightness', CHECK_STATUS.WARN, rounded, `ความสว่างเฉลี่ย ${rounded} (บางช่วงเกินเกณฑ์)`,
      null, 'แสงไม่สม่ำเสมอ ควรใช้ในที่แสงสม่ำเสมอ — ต้องการแสงสว่างเพียงพอ เพื่อความแม่นยำ')
  }
  return check('brightness', CHECK_STATUS.PASS, rounded, `ความสว่างเฉลี่ย ${rounded}`, null, null)
}

function assessBlur(accumulator) {
  const values = accumulator.edgeDetail
  if (!values.length) return check('blur', CHECK_STATUS.NOT_RUN, null, 'ไม่ได้เก็บตัวอย่างภาพ', 'ไม่สามารถตรวจความเบลอได้ กรุณาลองใหม่', null)
  const meanEdge = mean(values)
  const rounded = Number(meanEdge.toFixed(1))
  if (meanEdge < QUALITY_THRESHOLDS.BLUR_MIN) {
    return check('blur', CHECK_STATUS.FAIL, rounded, `ความคมชัดต่ำ (${rounded}) — ภาพเบลอหรือรายละเอียดไม่พอ`,
      'ภาพเบลอ กรุณาทำความสะอาดเลนส์ จัดระยะกับกล้องใหม่ และนิ่งกว่าเดิม', null)
  }
  if (meanEdge < QUALITY_THRESHOLDS.BLUR_WARN) {
    return check('blur', CHECK_STATUS.WARN, rounded, `ความคมชัดปานกลาง (${rounded})`,
      null, 'ภาพค่อนข้างเบลอ ควรจัดระยะกล้องให้คมชัดขึ้น')
  }
  return check('blur', CHECK_STATUS.PASS, rounded, `ความคมชัดพอ (${rounded})`, null, null)
}

function assessFps(processedFrames, elapsedMs) {
  if (elapsedMs <= 0 || !processedFrames) {
    return check('fps', CHECK_STATUS.FAIL, 0, 'ไม่มีเฟรมที่ประมวลผลได้', 'กล้องไม่ส่งเฟรมภาพ กรุณาลองใหม่หรือเปลี่ยนอุปกรณ์', null)
  }
  const fps = processedFrames / (elapsedMs / 1000)
  const rounded = Number(fps.toFixed(1))
  if (fps < QUALITY_THRESHOLDS.FPS_MIN) {
    return check('fps', CHECK_STATUS.FAIL, rounded, `ประมวลผลได้ ${rounded} เฟรม/วินาที — ต่ำเกินไปสำหรับสัญญาณหายใจ`,
      'อุปกรณ์ประมวลผลช้าเกินไป กรุณาปิดแอปอื่นหรือใช้อุปกรณ์ที่เร็วกว่าแล้ววัดใหม่', null)
  }
  if (fps < QUALITY_THRESHOLDS.FPS_WARN) {
    return check('fps', CHECK_STATUS.WARN, rounded, `ประมวลผลได้ ${rounded} เฟรม/วินาที (ค่อนข้างต่ำ)`,
      null, 'การประมวลผลช้า อาจทำให้ค่าไม่แม่น ควรปิดโปรแกรมอื่นขณะวัด')
  }
  return check('fps', CHECK_STATUS.PASS, rounded, `ประมวลผลได้ ${rounded} เฟรม/วินาที`, null, null)
}

function assessDroppedFrames(processedFrames, rafFrames) {
  if (!rafFrames) return check('droppedFrames', CHECK_STATUS.NOT_RUN, null, 'ไม่มีลูปภาพทำงาน', 'ไม่สามารถตรวจเฟรมที่หลุดได้ กรุณาลองใหม่', null)
  const droppedRatio = Math.max(0, 1 - (processedFrames || 0) / rafFrames)
  const percent = Math.round(droppedRatio * 100)
  if (droppedRatio > QUALITY_THRESHOLDS.DROPPED_FAIL_RATIO) {
    return check('droppedFrames', CHECK_STATUS.FAIL, percent, `เฟรมหลุด ${percent}% — สัญญาณไม่ต่อเนื่องพอ`,
      'ภาพกระตุก/เฟรมหลุดมาก กรุณาปิดแอปอื่นแล้ววัดใหม่', null)
  }
  if (droppedRatio > QUALITY_THRESHOLDS.DROPPED_WARN_RATIO) {
    return check('droppedFrames', CHECK_STATUS.WARN, percent, `เฟรมหลุด ${percent}%`, null, 'มีเฟรมหลุดบ้าง อาจกระทบความแม่น')
  }
  return check('droppedFrames', CHECK_STATUS.PASS, percent, `เฟรมหลุด ${percent}%`, null, null)
}

function assessMotion(accumulator) {
  const values = accumulator.frameChange
  if (!values.length) return check('motion', CHECK_STATUS.NOT_RUN, null, 'ไม่พบตัวอย่างการเคลื่อนไหว (เฟรมแรก)', null, null)
  const meanChange = mean(values)
  const strongRatio = ratioOf(values, (value) => value > QUALITY_THRESHOLDS.MOTION_MAX)
  const rounded = Number(meanChange.toFixed(1))
  if (meanChange > QUALITY_THRESHOLDS.MOTION_MAX || strongRatio > QUALITY_THRESHOLDS.MOTION_FAIL_RATIO) {
    return check('motion', CHECK_STATUS.FAIL, rounded, `การเคลื่อนไหว/ขยับตัวมาก (เฉลี่ย ${rounded})`,
      'ตรวจพบการขยับตัว/การพูด/การไอมาก กรุณานั่งนิ่ง หยุดพูด หายใจตามปกติ แล้ววัดใหม่', null)
  }
  if (meanChange > QUALITY_THRESHOLDS.MOTION_WARN || strongRatio > QUALITY_THRESHOLDS.MOTION_WARN_RATIO) {
    return check('motion', CHECK_STATUS.WARN, rounded, `มีการเคลื่อนไหวบ้าง (เฉลี่ย ${rounded})`,
      null, 'พบการขยับ/พูด/ไอบ้างระหว่างวัด ควรนั่งนิ่งตลอด 30 วินาที')
  }
  return check('motion', CHECK_STATUS.PASS, rounded, `นิ่งดี (เฉลี่ย ${rounded})`, null, null)
}

function assessPeriodicity(periodicity) {
  const value = Number.isFinite(periodicity) ? Number(periodicity.toFixed(2)) : null
  if (value === null || value < QUALITY_THRESHOLDS.PERIODICITY_WARN) {
    return check('periodicity', CHECK_STATUS.FAIL, value, `ความเป็นคาบของสัญญาณหายใจต่ำ (${value ?? 'n/a'})`,
      'สัญญาณหายใจไม่สม่ำเสมอ (อาจขยับ/พูด/ไอ หรือวัดไม่นิ่ง) กรุณานั่งนิ่งแล้ววัดใหม่', null)
  }
  if (value < QUALITY_THRESHOLDS.PERIODICITY_PASS) {
    return check('periodicity', CHECK_STATUS.WARN, value, `ความเป็นคาบปานกลาง (${value})`,
      null, 'จังหวะการหายใจไม่สม่ำเสมอพอ ควรหายใจตามปกติและนิ่ง ๆ')
  }
  return check('periodicity', CHECK_STATUS.PASS, value, `จังหวะหายใจสม่ำเสมอ (${value})`, null, null)
}

function assessIntervalCv(intervalCv) {
  const value = Number.isFinite(intervalCv) ? Number(intervalCv.toFixed(2)) : null
  if (value === null || value > QUALITY_THRESHOLDS.INTERVAL_CV_WARN) {
    return check('intervalCv', CHECK_STATUS.FAIL, value, `ช่วงห่างจังหวะหายใจแปรปรวนมาก (CV ${value ?? 'n/a'})`,
      'จังหวะหายใจไม่แน่นอน กรุณานั่งพักสักครู่แล้ววัดใหม่', null)
  }
  if (value > QUALITY_THRESHOLDS.INTERVAL_CV_PASS) {
    return check('intervalCv', CHECK_STATUS.WARN, value, `ช่วงห่างจังหวะหายใจแปรปรวนบ้าง (CV ${value})`,
      null, 'จังหวะหายใจค่อนข้างสม่ำเสมอขึ้นได้ ควรหายใจตามปกติ')
  }
  return check('intervalCv', CHECK_STATUS.PASS, value, `จังหวะหายใจสม่ำเสมอ (CV ${value})`, null, null)
}

// ---------- main builder ----------
/**
 * สร้าง structured quality result จากข้อมูลการวัดครั้งเดียว
 * @param {object} input
 * @param {object} input.accumulator          ผลรวม per-frame จาก createQualityAccumulator
 * @param {number} input.elapsedMs            ระยะเวลาวัดจริง
 * @param {number} input.requiredMs           ระยะเวลาที่กำหนด (เช่น 30000)
 * @param {number} input.processedFrames      จำนวนเฟรมที่ประมวลผล (pose)
 * @param {number} input.rafFrames            จำนวนรอบ rAF ทั้งหมด
 * @param {object|null} input.rrResult        ผลจาก computeBreathingRate { bpm, peaks, spanMs, periodicity }
 */
export function buildQualityResult(input) {
  const {
    accumulator = createQualityAccumulator(),
    elapsedMs = 0,
    requiredMs = 30000,
    processedFrames = 0,
    rafFrames = 0,
    rrResult = null,
  } = input || {}

  const checks = [
    assessDuration(elapsedMs, requiredMs),
    assessPoseVisibility(accumulator),
    assessBrightness(accumulator),
    assessBlur(accumulator),
    assessFps(processedFrames, elapsedMs),
    assessDroppedFrames(processedFrames, rafFrames),
    assessMotion(accumulator),
    assessPeriodicity(rrResult?.periodicity),
    assessIntervalCv(computeIntervalCv(rrResult?.peaks)),
  ]

  const failed = checks.filter((item) => item.status === CHECK_STATUS.FAIL)
  const warned = checks.filter((item) => item.status === CHECK_STATUS.WARN)
  const qualityStatus = failed.length
    ? QUALITY_STATUS.INSUFFICIENT
    : warned.length
      ? QUALITY_STATUS.ACCEPTABLE
      : QUALITY_STATUS.GOOD
  const qualityReasons = failed.length
    ? failed.map((item) => `${item.id}:fail`)
    : warned.map((item) => `${item.id}:warn`)

  const canUseMeasurement = failed.length === 0
  const fixable = failed.length ? failed : warned
  const retryGuidance = fixable.length
    ? `คำแนะนำการวัดใหม่: ${fixable.map((item) => item.retryNote).filter(Boolean).join(' ')}`
    : null
  const missingReason = canUseMeasurement
    ? null
    : `ค่าการวัดไม่ถูกใช้เพราะคุณภาพไม่ผ่านเกณฑ์ (${failed.map((item) => item.id).join(', ')})`

  return {
    qualityStatus,
    qualityReasons,
    canUseMeasurement,
    retryGuidance,
    missingReason,
    checks,
    clinicalAccuracy: CLINICAL_ACCURACY_STATUS,
  }
}

// ---------- HR quality gate (สัญญาณที่ 2) ----------
/**
 * แยกชั้นค่า HR: ค่าที่วัดได้ / algorithm confidence / ความน่าใช้
 * - confidence ของ vitallens เป็นตัวชี้วัดภายในอัลกอริทึม ไม่ใช่ clinical accuracy
 * - ต่ำกว่า HR_CONFIDENCE_MIN → ถือว่าใช้ไม่ได้ (missing) ห้ามป้อน scoring
 */
export function assessHrQuality(hrBpm, confidence) {
  if (!Number.isFinite(hrBpm) || hrBpm <= 0) {
    return { usable: false, level: 'missing', missingReason: 'ไม่ได้รับค่า HR จาก vitallens (ไม่พบใบหน้าหรือสัญญาณไม่พอ)', confidence: null }
  }
  const conf = Number.isFinite(confidence) ? confidence : null
  if (conf !== null && conf < QUALITY_THRESHOLDS.HR_CONFIDENCE_MIN) {
    return {
      usable: false,
      level: 'low_confidence',
      missingReason: `Algorithm Confidence ต่ำเกินเกณฑ์ (${conf.toFixed(2)} < ${QUALITY_THRESHOLDS.HR_CONFIDENCE_MIN}) — ค่า HR ไม่ถูกนำไปใช้`,
      confidence: conf,
    }
  }
  const warned = conf !== null && conf < QUALITY_THRESHOLDS.HR_CONFIDENCE_WARN
  return {
    usable: true,
    level: warned ? 'low_confidence_warning' : 'ok',
    missingReason: null,
    confidence: conf,
  }
}
