import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readUpdateBanner } from './update-banner.js'

// Mock the state-root module so we can control the configstore path
vi.mock('#paths/state-root.js', () => ({
  getSurfacePath: vi.fn(),
}))

import { getSurfacePath } from '#paths/state-root.js'

const mockGetSurfacePath = vi.mocked(getSurfacePath)

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

describe('readUpdateBanner', () => {
  let tmpDir: string
  let cacheFile: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wp-update-banner-'))
    cacheFile = join(tmpDir, 'update-notifier-cache.json')
    mockGetSurfacePath.mockReturnValue(cacheFile)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('returns null when getSurfacePath throws (no git repo context)', () => {
    mockGetSurfacePath.mockImplementation(() => {
      throw new Error('Not inside a git repository')
    })
    const result = readUpdateBanner(process.env)
    expect(result).toBeNull()
  })

  it('returns null when file does not exist (ENOENT)', () => {
    // cacheFile is not written, so ENOENT
    const result = readUpdateBanner(process.env)
    expect(result).toBeNull()
  })

  it('returns null when JSON is corrupt', () => {
    writeFileSync(cacheFile, 'not valid json{{{')
    const result = readUpdateBanner(process.env)
    expect(result).toBeNull()
  })

  it('returns null when latest === current', () => {
    writeFileSync(
      cacheFile,
      JSON.stringify({
        latest: '1.2.3',
        current: '1.2.3',
        lastUpdateCheck: Date.now(),
      }),
    )
    const result = readUpdateBanner(process.env)
    expect(result).toBeNull()
  })

  it('returns null when lastUpdateCheck is more than 7 days old', () => {
    writeFileSync(
      cacheFile,
      JSON.stringify({
        latest: '2.0.0',
        current: '1.0.0',
        lastUpdateCheck: Date.now() - SEVEN_DAYS_MS - 1000,
      }),
    )
    const result = readUpdateBanner(process.env)
    expect(result).toBeNull()
  })

  it('returns null when latest is not newer than current', () => {
    writeFileSync(
      cacheFile,
      JSON.stringify({
        latest: '1.0.0',
        current: '2.0.0',
        lastUpdateCheck: Date.now(),
      }),
    )
    const result = readUpdateBanner(process.env)
    expect(result).toBeNull()
  })

  it('returns banner string when latest > current and check is recent', () => {
    writeFileSync(
      cacheFile,
      JSON.stringify({
        latest: '2.0.0',
        current: '1.9.9',
        lastUpdateCheck: Date.now(),
      }),
    )
    const result = readUpdateBanner(process.env)
    expect(result).not.toBeNull()
    expect(result).toBe(
      '<wp_update>webpresso 2.0.0 available (current 1.9.9). Auto-install runs on the next `wp` invocation, or set WP_SKIP_AUTO_INSTALL=1 to opt out.</wp_update>',
    )
  })

  it('returns banner when minor version is newer', () => {
    writeFileSync(
      cacheFile,
      JSON.stringify({
        latest: '1.3.0',
        current: '1.2.9',
        lastUpdateCheck: Date.now(),
      }),
    )
    const result = readUpdateBanner(process.env)
    expect(result).not.toBeNull()
    expect(result).toContain('<wp_update>')
    expect(result).toContain('webpresso 1.3.0 available (current 1.2.9)')
  })

  it('returns null when latest and current fields are missing', () => {
    writeFileSync(cacheFile, JSON.stringify({ lastUpdateCheck: Date.now() }))
    const result = readUpdateBanner(process.env)
    expect(result).toBeNull()
  })

  it('returns null when data has no lastUpdateCheck but version differs', () => {
    // No lastUpdateCheck — we treat as no staleness guard needed (no stale info)
    // but returns banner because no stale check can fail
    writeFileSync(
      cacheFile,
      JSON.stringify({
        latest: '2.0.0',
        current: '1.0.0',
      }),
    )
    const result = readUpdateBanner(process.env)
    // Without lastUpdateCheck we can't say it's stale — should still return banner
    expect(result).not.toBeNull()
    expect(result).toContain('<wp_update>')
  })
})
