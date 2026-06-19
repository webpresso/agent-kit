import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  parseUpdateCacheTimestamp,
  readFreshCachedLatestRelease,
  readUpdateNotifierCache,
} from './cache.js'

describe('auto-update cache helpers', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  function makeCacheFile(content: unknown): string {
    dir = mkdtempSync(join(tmpdir(), 'wp-update-cache-'))
    const path = join(dir, 'update-notifier-cache.json')
    writeFileSync(path, JSON.stringify(content), 'utf8')
    return path
  }

  it('reads a valid cache object from disk', () => {
    const path = makeCacheFile({
      latest: '2.1.1',
      current: '2.1.0',
      lastUpdateCheck: 1234,
    })

    expect(readUpdateNotifierCache(path)).toStrictEqual({
      latest: '2.1.1',
      current: '2.1.0',
      lastUpdateCheck: 1234,
    })
  })

  it('returns null for malformed or non-object cache content', () => {
    dir = mkdtempSync(join(tmpdir(), 'wp-update-cache-bad-'))
    const malformed = join(dir, 'malformed.json')
    writeFileSync(malformed, '{not-json', 'utf8')
    const arrayPath = join(dir, 'array.json')
    writeFileSync(arrayPath, JSON.stringify(['bad']), 'utf8')

    expect(readUpdateNotifierCache(malformed)).toBeNull()
    expect(readUpdateNotifierCache(arrayPath)).toBeNull()
  })

  it('parses numeric and ISO-string timestamps', () => {
    expect(parseUpdateCacheTimestamp(1234)).toBe(1234)
    expect(parseUpdateCacheTimestamp('2026-06-19T10:00:00.000Z')).toBeTypeOf('number')
    expect(parseUpdateCacheTimestamp('not-a-date')).toBeNull()
    expect(parseUpdateCacheTimestamp(null)).toBeNull()
  })

  it('returns the latest version only when the cache is fresh', () => {
    const now = Date.now()
    const freshPath = makeCacheFile({
      latest: '2.1.1',
      lastUpdateCheck: now - 1_000,
    })
    expect(readFreshCachedLatestRelease(freshPath, now)).toBe('2.1.1')

    const stalePath = makeCacheFile({
      latest: '2.1.1',
      lastUpdateCheck: now - 24 * 60 * 60 * 1000 - 1,
    })
    expect(readFreshCachedLatestRelease(stalePath, now)).toBeNull()
  })

  it('accepts ISO-string timestamps for freshness checks', () => {
    const now = Date.now()
    const freshIso = new Date(now - 5_000).toISOString()
    const path = makeCacheFile({
      latest: '2.1.1',
      lastUpdateCheck: freshIso,
    })

    expect(readFreshCachedLatestRelease(path, now)).toBe('2.1.1')
  })
})
