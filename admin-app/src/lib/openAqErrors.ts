export class UpstreamRequestError extends Error {
  constructor(public readonly upstreamStatus: number, public readonly endpointPath: string) {
    super(`Upstream HTTP ${upstreamStatus}`)
    this.name = 'UpstreamRequestError'
  }
}

export class OpenAQConfigurationError extends Error {
  constructor(public readonly configurationStatus: 'missing' | 'empty' | 'malformed') {
    super(`OPENAQ_API_KEY_${configurationStatus.toUpperCase()}`)
    this.name = 'OpenAQConfigurationError'
  }
}
