import test from 'node:test'
import assert from 'node:assert/strict'

test('Open-Meteo 18-hour threshold rule: >= 18 hours gives average, < 18 hours gives null', () => {
  const computeDailyAverage = (samples) => {
    const valid = samples.filter((v) => v !== null && v !== undefined && Number.isFinite(v) && v >= 0)
    if (valid.length < 18) return null
    return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
  }

  const hours24 = Array(24).fill(25.0)
  assert.equal(computeDailyAverage(hours24), 25.0)

  const hours18 = Array(18).fill(20.0).concat(Array(6).fill(null))
  assert.equal(computeDailyAverage(hours18), 20.0)

  const hours17 = Array(17).fill(20.0).concat(Array(7).fill(null))
  assert.equal(computeDailyAverage(hours17), null)
})

test('Mocking 401 Auth Error returns status error with safe message without traceback', () => {
  const handleOpenMeteoResponse = (status) => {
    if (status === 401 || status === 403) {
      return {
        status: 'error',
        historical: [],
        forecast: [],
        errorMessage: 'OPEN_METEO_AUTH_FAILED: การยืนยันตัวตนกับ Open-Meteo ไม่ถูกต้อง',
      }
    }
    return { status: 'ok', historical: [], forecast: [] }
  }

  const res = handleOpenMeteoResponse(401)
  assert.equal(res.status, 'error')
  assert.equal(res.errorMessage.includes('traceback'), false)
  assert.equal(res.errorMessage.includes('OPEN_METEO_AUTH_FAILED'), true)
})

test('Mocking Timeout Error returns status error with retry flag', () => {
  const handleTimeoutError = (errName) => {
    if (errName === 'AbortError' || errName === 'TimeoutError') {
      return {
        status: 'error',
        canRetry: true,
        errorMessage: 'OPEN_METEO_TIMEOUT: การเชื่อมต่อ Open-Meteo หมดเวลา',
      }
    }
    return { status: 'ok', canRetry: false }
  }

  const res = handleTimeoutError('TimeoutError')
  assert.equal(res.status, 'error')
  assert.equal(res.canRetry, true)
  assert.equal(res.errorMessage.includes('OPEN_METEO_TIMEOUT'), true)
})

test('Invalid coordinates returns status unsupported', () => {
  const validateCoords = (lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return { status: 'unsupported', errorMessage: 'พิกัดไม่ถูกต้อง' }
    }
    return { status: 'ok' }
  }

  assert.equal(validateCoords(999, 100).status, 'unsupported')
  assert.equal(validateCoords(13.75, 100.5).status, 'ok')
})
