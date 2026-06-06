import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, test } from 'vitest'

import { isDirectEntrypoint } from './direct-entrypoint.js'

describe('isDirectEntrypoint', () => {
  test('returns false instead of throwing for Bun virtual argv paths', () => {
    expect(isDirectEntrypoint(import.meta.url, '/$bunfs/root/wp')).toBe(false)
  })

  test('compares real filesystem entrypoints when both paths exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp-direct-entrypoint-'))
    mkdirSync(join(dir, 'nested'))
    const file = join(dir, 'nested', 'entry.ts')
    writeFileSync(file, 'export {}\n')

    expect(isDirectEntrypoint(pathToFileURL(file).href, resolve(file))).toBe(true)
  })
})
