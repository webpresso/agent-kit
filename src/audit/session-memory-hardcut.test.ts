import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { auditSessionMemoryHardcut } from './session-memory-hardcut.js'

const CTX_RS = ['ctx', 'rs'].join('-')

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), 'session-memory-hardcut-audit-'))
}

describe('session-memory hard-cut audit', () => {
  it('flags banned legacy strings in live operational surfaces', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'src', 'session-memory'), { recursive: true })
    writeFileSync(join(root, 'src', 'session-memory', 'legacy-bridge.ts'), `${CTX_RS} bridge\n`)

    const result = auditSessionMemoryHardcut(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/session-memory/legacy-bridge.ts',
          message: expect.stringContaining(CTX_RS),
        }),
      ]),
    )
  })

  it('ignores archival parked blueprint references', () => {
    const root = tempRepo()
    mkdirSync(join(root, 'blueprints', 'parked', 'hist'), { recursive: true })
    writeFileSync(join(root, 'blueprints', 'parked', 'hist', '_overview.md'), `${CTX_RS} history\n`)

    const result = auditSessionMemoryHardcut(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })
})
