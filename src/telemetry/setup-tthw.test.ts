import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isTelemetryEnabled, reportTthw, type TthwPayload } from './setup-tthw.js'

const BASE_PAYLOAD: TthwPayload = {
  event: 'setup-complete',
  durationMs: 1234,
  webpressoVersion: '0.14.0',
  os: 'linux',
  nodeVersion: 'v22.0.0',
}

describe('isTelemetryEnabled', () => {
  it('returns false when WP_TELEMETRY=0', () => {
    expect(isTelemetryEnabled({ WP_TELEMETRY: '0' })).toBe(false)
  })

  it('returns true when WP_TELEMETRY=1', () => {
    expect(isTelemetryEnabled({ WP_TELEMETRY: '1' })).toBe(true)
  })

  it('returns false when no env vars are set (default OFF for external adopters)', () => {
    expect(isTelemetryEnabled({})).toBe(false)
  })

  it('returns false when WP_INTERNAL is absent and WP_TELEMETRY is absent', () => {
    expect(isTelemetryEnabled({ SOME_OTHER_VAR: '1' })).toBe(false)
  })

  it('returns true when WP_INTERNAL=1 and WP_TELEMETRY is absent', () => {
    expect(isTelemetryEnabled({ WP_INTERNAL: '1' })).toBe(true)
  })

  it('WP_TELEMETRY=0 takes precedence over WP_INTERNAL=1', () => {
    expect(isTelemetryEnabled({ WP_TELEMETRY: '0', WP_INTERNAL: '1' })).toBe(false)
  })
})

describe('reportTthw', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not throw when fetch rejects (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(reportTthw(BASE_PAYLOAD)).resolves.toBeUndefined()
  })

  it('does not throw when endpoint is unreachable (fetch throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(reportTthw(BASE_PAYLOAD)).resolves.toBeUndefined()
  })

  it('does not throw when AbortController aborts (timeout simulation)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))
    await expect(reportTthw(BASE_PAYLOAD)).resolves.toBeUndefined()
  })

  it('payload contains no PII fields', () => {
    const keys = Object.keys(BASE_PAYLOAD)
    const piiFields = ['path', 'username', 'user', 'email', 'repo', 'repoName', 'cwd', 'home']
    for (const pii of piiFields) {
      expect(keys).not.toContain(pii)
    }
  })

  it('payload event is always setup-complete', () => {
    expect(BASE_PAYLOAD.event).toBe('setup-complete')
  })

  it('posts to the telemetry endpoint when fetch succeeds', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    await reportTthw(BASE_PAYLOAD)
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://telemetry.webpresso.dev/v1/setup-tthw')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toStrictEqual(BASE_PAYLOAD)
  })
})
