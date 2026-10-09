// Service ดึงข้อมูลพยากรณ์รายชั่วโมง (persistence 1-3 ชม.) — retry เบา ๆ + ไม่ cache เพราะข้อมูลสด
function endpointPath(url) {
  try {
    return new URL(url, globalThis.location?.origin || 'http://localhost').pathname
  } catch {
    return '/api/air-quality/hourly-forecast'
  }
}

async function attempt(url, { signal, timeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  const onAbort = () => controller.abort(new DOMException('Request aborted', 'AbortError'))
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
    const responseText = await response.text()
    let payload = null
    try { payload = responseText ? JSON.parse(responseText) : null } catch { /* handled as an invalid server response below */ }
    if (!response.ok || !payload || typeof payload !== 'object') {
      const message = payload?.message || (response.status === 502 || response.status === 503
        ? 'เซิร์ฟเวอร์ข้อมูลไม่พร้อมใช้งาน กรุณาตรวจสอบว่าเปิด admin-app แล้ว'
        : `เซิร์ฟเวอร์ตอบกลับผิดปกติ (HTTP ${response.status})`)
      const error = new Error(message)
      error.status = response.status
      error.code = payload?.error
      throw error
    }
    return payload
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error('รอข้อมูลนานเกินไป กรุณาลองอีกครั้ง', { cause: error })
    if (error instanceof TypeError) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง', { cause: error })
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * ดึงผลพยากรณ์รายชั่วโมงจาก backend — ไม่มี fallback ค่าเดา: error ส่งต่อให้ caller แสดงสถานะตรง ๆ
 */
export async function fetchHourlyForecast(url, { retries = 1, timeoutMs = 10000, signal } = {}) {
  let lastError
  for (let attemptNo = 0; attemptNo <= retries; attemptNo += 1) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
    try {
      return await attempt(url, { signal, timeoutMs })
    } catch (error) {
      lastError = error
      if (error?.name === 'AbortError' || signal?.aborted) throw error
      if (attemptNo === retries) break
      await new Promise((resolve) => setTimeout(resolve, 400 * (attemptNo + 1)))
    }
  }
  throw lastError || new Error('hourly forecast request failed')
}

export { endpointPath }
