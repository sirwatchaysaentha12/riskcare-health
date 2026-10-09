import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const rawKey = process.env.OPENAQ_API_KEY
if (rawKey === undefined) {
  console.log('OpenAQ health: missing')
  process.exitCode = 1
} else {
  const apiKey = rawKey.trim()
  if (!apiKey) {
    console.log('OpenAQ health: empty')
    process.exitCode = 1
  } else if (/[\u0000-\u001f\u007f]/.test(apiKey) || /^[`'"].*[`'"]$/.test(apiKey)) {
    console.log('OpenAQ health: malformed')
    process.exitCode = 1
  } else {
    try {
      const response = await fetch('https://api.openaq.org/v3/locations/225579', {
        headers: { Accept: 'application/json', 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(15000),
      })
      const status = response.status
      await response.body?.cancel()
      const health = response.ok
        ? 'configured'
        : status === 401 || status === 403
          ? 'rejected'
          : status === 429
            ? 'rate_limited'
            : status >= 500
              ? 'upstream_error'
              : 'upstream_error'
      console.log(`OpenAQ health: ${health} (HTTP ${status})`)
      if (!response.ok) process.exitCode = 1
    } catch (error) {
      const health = error instanceof Error && /timeout/i.test(error.name) ? 'timeout' : 'network_error'
      console.log(`OpenAQ health: ${health}`)
      process.exitCode = 1
    }
  }
}
