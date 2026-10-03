const successfulResponses = new Map()

function cacheKey(url) {
  return String(url)
}

function endpointPath(url) {
  try {
    return new URL(url, globalThis.location?.origin || 'http://localhost').pathname
  } catch {
    return '/api/air-quality/dashboard'
  }
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Request aborted', 'AbortError'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Request aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function fetchAttempt(url, { fetchImpl, timeoutMs, signal }) {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Request timed out', 'TimeoutError'))
  }, timeoutMs)
  const abortFromCaller = () => controller.abort(new DOMException('Request aborted', 'AbortError'))
  signal?.addEventListener('abort', abortFromCaller, { once: true })
  try {
    console.log('[AirQualityDashboard] request started', { endpoint: endpointPath(url) })
    const response = await fetchImpl(url, { cache: 'no-store', signal: controller.signal })
    console.log('[AirQualityDashboard] response received', {
      endpoint: endpointPath(url),
      httpStatus: response.status,
      ok: response.ok,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(`Dashboard API returned HTTP ${response.status}`)
      error.status = response.status
      error.code = payload?.error || `HTTP_${response.status}`
      error.upstreamStatus = payload?.upstreamStatus
      error.message = payload?.message || error.message
      throw error
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Dashboard API returned an invalid response')
    }
    if (payload.state === 'error') {
      const error = new Error(payload.message || 'Dashboard API reported an error')
      error.status = response.status
      error.code = payload.error || 'DASHBOARD_API_ERROR'
      error.upstreamStatus = payload.upstreamStatus
      throw error
    }
    return payload
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error('Dashboard API request timed out')
      timeoutError.code = 'ETIMEDOUT'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

/**
 * Fetch dashboard data with two retries and a tab-local last-known-good cache.
 * Cached rows are explicitly returned as stale; this function never fabricates readings.
 */
export async function fetchAirQualityDashboard(url, {
  fetchImpl = globalThis.fetch,
  retries = 2,
  timeoutMs = 8000,
  signal,
  retryDelayMs = 250,
} = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
    try {
      const payload = await fetchAttempt(url, { fetchImpl, timeoutMs, signal })
      const record = { payload, cachedAt: Date.now() }
      successfulResponses.set(cacheKey(url), record)
      return { payload, source: 'live', cachedAt: record.cachedAt }
    } catch (error) {
      lastError = error
      if (error?.name === 'AbortError' || signal?.aborted) throw error
      const shouldRetry = error?.status === undefined || isRetryableStatus(error.status)
      if (!shouldRetry || attempt === retries) break
      await wait(retryDelayMs * (attempt + 1), signal)
    }
  }

  const cached = successfulResponses.get(cacheKey(url))
  if (cached) return { payload: cached.payload, source: 'stale', cachedAt: cached.cachedAt, error: lastError }
  throw lastError || new Error('Dashboard API request failed')
}

export function clearAirQualityDashboardCache() {
  successfulResponses.clear()
}
