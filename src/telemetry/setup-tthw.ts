import { TELEMETRY_ENDPOINT, TELEMETRY_TIMEOUT_MS } from './_endpoint.js'

export interface TthwPayload {
  readonly event: 'setup-complete'
  readonly durationMs: number
  readonly webpressoVersion: string
  readonly os: string // process.platform
  readonly nodeVersion: string // process.version
  // NO repo identifiers, NO paths, NO usernames, NO PII
}

export function isTelemetryEnabled(env: Record<string, string | undefined>): boolean {
  if (env['WP_TELEMETRY'] === '0') return false
  if (env['WP_TELEMETRY'] === '1') return true
  if (env['WP_INTERNAL'] === '1') return true
  return false
}

export async function reportTthw(payload: TthwPayload): Promise<void> {
  if (process.env['WP_TELEMETRY_DEBUG'] === '1') {
    console.error('[wp telemetry]', JSON.stringify(payload))
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS)
    try {
      await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  } catch {
    // intentionally silent — telemetry must never block or surface errors
  }
}
