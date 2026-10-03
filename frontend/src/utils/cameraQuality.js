const MIN_BRIGHTNESS = 38
const MAX_BRIGHTNESS = 225
const MIN_EDGE_DETAIL = 4
const MAX_FRAME_CHANGE = 36
const MIN_LANDMARK_VISIBILITY = 0.5
const MIN_SHOULDER_SPAN = 0.075
const MIN_DISTANCE_SHOULDER_SPAN = 0.1
const MAX_DISTANCE_SHOULDER_SPAN = 0.45

function isVisibleInFrame(point) {
  return Boolean(
    point &&
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0.02 && point.x <= 0.98 &&
    point.y >= 0.02 && point.y <= 0.98 &&
    (point.visibility ?? 0) >= MIN_LANDMARK_VISIBILITY
  )
}

export function isVideoFrameReady(video) {
  return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
}

/**
 * Lightweight camera-preview checks. These heuristics are UI guidance only,
 * not validated clinical signal-quality or diagnostic measurements.
 */
export function analyzeCameraFrame(imageData, landmarks, previousFrame = null) {
  const { data, width, height } = imageData || {}
  if (!data || !Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) {
    return { status: 'checking', issues: ['กำลังรับภาพจากกล้อง'], torsoVisible: false, distanceStatus: 'unknown', sampledFrame: null }
  }

  const gray = new Uint8Array(width * height)
  let brightnessTotal = 0
  for (let pixel = 0; pixel < gray.length; pixel++) {
    const offset = pixel * 4
    const value = Math.round((data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114))
    gray[pixel] = value
    brightnessTotal += value
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
  if (previousFrame?.length === gray.length) {
    let changeTotal = 0
    for (let i = 0; i < gray.length; i += 4) changeTotal += Math.abs(gray[i] - previousFrame[i])
    frameChange = changeTotal / Math.ceil(gray.length / 4)
  }

  const shoulderLeftVisible = isVisibleInFrame(landmarks?.[11])
  const shoulderRightVisible = isVisibleInFrame(landmarks?.[12])
  const hipsVisible = isVisibleInFrame(landmarks?.[23]) && isVisibleInFrame(landmarks?.[24])
  const torsoVisible = shoulderLeftVisible && shoulderRightVisible && hipsVisible
  const shoulderSpan = shoulderLeftVisible && shoulderRightVisible
    ? Math.abs(landmarks[11].x - landmarks[12].x)
    : null
  // A narrow projected shoulder span can indicate a side-on pose; this is a
  // conservative framing hint, not a validated orientation measurement.
  const turnedSideways = shoulderSpan !== null && shoulderSpan < MIN_SHOULDER_SPAN
  const distanceStatus = shoulderSpan === null
    ? 'unknown'
    : shoulderSpan < MIN_DISTANCE_SHOULDER_SPAN
      ? 'too_far'
      : shoulderSpan > MAX_DISTANCE_SHOULDER_SPAN
        ? 'too_close'
        : 'optimal'
  const torsoPartiallyObscured = shoulderLeftVisible && shoulderRightVisible && !hipsVisible
  const issues = []
  if (brightness < MIN_BRIGHTNESS) issues.push('ภาพมืดเกินไป ลองเพิ่มแสงในห้อง')
  else if (brightness > MAX_BRIGHTNESS) issues.push('ภาพสว่างจ้าเกินไป ลองหลีกเลี่ยงแสงย้อน')
  if (edgeDetail < MIN_EDGE_DETAIL) issues.push('ภาพอาจเบลอหรือรายละเอียดไม่พอ ลองทำความสะอาดเลนส์และจัดภาพใหม่')
  if (frameChange !== null && frameChange > MAX_FRAME_CHANGE) issues.push('ภาพเปลี่ยนเร็ว ลองวางกล้องให้นิ่งและนั่งนิ่ง')
  if (turnedSideways) issues.push('กรุณาหันช่วงอกเข้าหากล้อง ไม่หันข้าง และจัดระยะให้เห็นช่วงไหล่')
  else if (distanceStatus === 'too_far') issues.push('ขยับเข้าใกล้กล้องอีกนิด แล้วจัดให้เห็นช่วงไหล่และลำตัวส่วนบน')
  else if (distanceStatus === 'too_close') issues.push('ขยับออกห่างกล้องอีกนิด เพื่อให้เห็นช่วงไหล่และลำตัวส่วนบน')
  if (!torsoVisible) {
    issues.push(torsoPartiallyObscured
      ? 'จุดช่วงลำตัวบางส่วนมองไม่เห็น อาจอยู่นอกเฟรมหรือถูกบัง กรุณาจัดเฟรมใหม่'
      : 'กรุณาจัดเฟรมให้เห็นช่วงไหล่และลำตัวส่วนบน โดยไม่มีสิ่งบดบัง')
  }

  return {
    status: issues.length ? 'warning' : 'ready',
    issues,
    torsoVisible,
    distanceStatus,
    turnedSideways,
    torsoPartiallyObscured,
    sampledFrame: gray,
  }
}
