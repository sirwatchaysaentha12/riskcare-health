import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAirQualityDashboardCache, fetchAirQualityDashboard } from '../src/services/airQualityDashboard.js'

const payload = (historical = [{ date: '2026-09-26', value: 12, unit: 'µg/m³', isForecast: false }]) => ({
  state: historical.length ? 'success' : 'empty',
  dataSource: 'OpenAQ',
  historical,
  forecast: [],
})

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('retries transient fetch errors twice and then returns live response', async () => {
  clearAirQualityDashboardCache()
  let calls = 0
  const result = await fetchAirQualityDashboard('/test/retry', {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1
      if (calls < 3) throw new TypeError('network unavailable')
      return response(payload())
    },
  })
  assert.equal(calls, 3)
  assert.equal(result.source, 'live')
  assert.equal(result.payload.historical[0].value, 12)
})

test('uses last known successful response after network and CORS-style failures', async () => {
  clearAirQualityDashboardCache()
  const url = '/test/stale-fallback'
  await fetchAirQualityDashboard(url, { fetchImpl: async () => response(payload()), retryDelayMs: 0 })
  let calls = 0
  const result = await fetchAirQualityDashboard(url, {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1
      throw new TypeError('Failed to fetch')
    },
  })
  assert.equal(calls, 3)
  assert.equal(result.source, 'stale')
  assert.equal(result.payload.historical[0].value, 12)
  assert.ok(result.cachedAt)
})

test('uses the last successful response after Backend returns HTTP 502', async () => {
  clearAirQualityDashboardCache()
  const url = '/test/backend-502-fallback'
  await fetchAirQualityDashboard(url, { fetchImpl: async () => response(payload()), retryDelayMs: 0 })

  let calls = 0
  const result = await fetchAirQualityDashboard(url, {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1
      return response({ state: 'error', error: 'BACKEND_UNAVAILABLE' }, 502)
    },
  })

  assert.equal(calls, 3)
  assert.equal(result.source, 'stale')
  assert.equal(result.payload.historical[0].value, 12)
})

test('does not invent readings when the live API returns an empty day range', async () => {
  clearAirQualityDashboardCache()
  const result = await fetchAirQualityDashboard('/test/empty', {
    fetchImpl: async () => response(payload([])),
  })
  assert.equal(result.source, 'live')
  assert.equal(result.payload.state, 'empty')
  assert.deepEqual(result.payload.historical, [])
})

test('returns a clear failure when no previously fetched data exists', async () => {
  clearAirQualityDashboardCache()
  await assert.rejects(
    fetchAirQualityDashboard('/test/no-cache', {
      retries: 0,
      fetchImpl: async () => { throw new TypeError('Failed to fetch') },
    }),
    /Failed to fetch/,
  )
})

test('preserves safe Backend error code and upstream status for the UI', async () => {
  clearAirQualityDashboardCache()
  await assert.rejects(
    fetchAirQualityDashboard('/test/upstream-401', {
      retries: 0,
      fetchImpl: async () => response({
        state: 'error',
        error: 'OPENAQ_API_KEY_REJECTED',
        upstreamStatus: 401,
        message: 'OpenAQ rejected authentication',
      }, 502),
    }),
    (error) => error.code === 'OPENAQ_API_KEY_REJECTED'
      && error.status === 502
      && error.upstreamStatus === 401
      && error.message === 'OpenAQ rejected authentication',
  )
})

test('retries a timed-out request and can recover', async () => {
  clearAirQualityDashboardCache()
  let calls = 0
  const result = await fetchAirQualityDashboard('/test/timeout', {
    retries: 1,
    retryDelayMs: 0,
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => {
      calls += 1
      if (calls === 1) {
        await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      }
      return response(payload())
    },
  })
  assert.equal(calls, 2)
  assert.equal(result.source, 'live')
})
