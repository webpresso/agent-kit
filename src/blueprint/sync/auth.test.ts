/**
 * Tests for loadSyncCredentials — env-var credential loading.
 *
 * Each test restores process.env to avoid cross-test pollution.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadSyncCredentials } from './auth.js'

const ORIGINAL_ENV = { ...process.env }

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe('loadSyncCredentials', () => {
  beforeEach(() => {
    // Clear sync-related env vars before each test
    delete process.env['WP_BLUEPRINT_PLATFORM_DISABLED']
    delete process.env['WP_BLUEPRINT_PLATFORM_TOKEN']
    delete process.env['WP_BLUEPRINT_PLATFORM_URL']
  })

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, ORIGINAL_ENV)
  })

  it('returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1', () => {
    setEnv({
      WP_BLUEPRINT_PLATFORM_DISABLED: '1',
      WP_BLUEPRINT_PLATFORM_TOKEN: 'tok-abc',
    })

    const creds = loadSyncCredentials()

    expect(creds).toStrictEqual(null)
  })

  it('returns null when WP_BLUEPRINT_PLATFORM_TOKEN is not set', () => {
    setEnv({ WP_BLUEPRINT_PLATFORM_TOKEN: undefined })

    const creds = loadSyncCredentials()

    expect(creds).toStrictEqual(null)
  })

  it('returns null when WP_BLUEPRINT_PLATFORM_TOKEN is empty string', () => {
    setEnv({ WP_BLUEPRINT_PLATFORM_TOKEN: '' })

    const creds = loadSyncCredentials()

    expect(creds).toStrictEqual(null)
  })

  it('returns credentials with default platformUrl when token is set', () => {
    setEnv({ WP_BLUEPRINT_PLATFORM_TOKEN: 'tok-abc' })

    const creds = loadSyncCredentials()

    expect(creds).not.toStrictEqual(null)
    expect(creds?.token).toStrictEqual('tok-abc')
    expect(creds?.platformUrl).toStrictEqual('https://api.webpresso.io')
  })

  it('uses WP_BLUEPRINT_PLATFORM_URL override when set', () => {
    setEnv({
      WP_BLUEPRINT_PLATFORM_TOKEN: 'tok-abc',
      WP_BLUEPRINT_PLATFORM_URL: 'https://custom.example.com',
    })

    const creds = loadSyncCredentials()

    expect(creds?.platformUrl).toStrictEqual('https://custom.example.com')
  })

  it('derives a repoId string (non-empty hex)', () => {
    setEnv({ WP_BLUEPRINT_PLATFORM_TOKEN: 'tok-abc' })

    const creds = loadSyncCredentials()

    expect(creds?.repoId).toMatch(/^[0-9a-f]+$/)
    expect((creds?.repoId ?? '').length).toBeGreaterThan(0)
  })

  it('returns the same repoId across two calls with the same env', () => {
    setEnv({ WP_BLUEPRINT_PLATFORM_TOKEN: 'tok-abc' })

    const a = loadSyncCredentials()
    const b = loadSyncCredentials()

    expect(a?.repoId).toStrictEqual(b?.repoId)
  })
})
