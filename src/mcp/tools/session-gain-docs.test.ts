import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { SESSION_MEMORY_NATIVE_TARGETS } from '../../session-memory/native-targets.js'

const CHECKED_DOCS = ['README.md', 'docs/guides/session-memory.md', 'docs/qa-output.md'] as const

describe('session gain docs wording', () => {
  it('does not describe token estimates as exact', () => {
    for (const path of CHECKED_DOCS) {
      expect(existsSync(path), `checked doc missing: ${path}`).toBe(true)
      const text = readFileSync(path, 'utf8')
      expect(text, path).not.toMatch(/exact\s+tokens?|tokens?\s+exact|tokenizer-exact/iu)
    }
  })

  it('keeps native session-memory docs aligned with target and fallback contract', () => {
    const text = readFileSync('docs/guides/session-memory.md', 'utf8')

    for (const target of SESSION_MEMORY_NATIVE_TARGETS) {
      expect(text).toContain(target.id)
    }
    expect(text).toContain('The native backend is optional')
    expect(text).toContain('TypeScript fallback')
    expect(text).toContain('visible in returned metadata')
    expect(text).toContain('WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE=1')
    expect(text).toContain('WP_NATIVE_SESSION_MEMORY_PATH=<path>')
    expect(text).toContain('shell command execution tools still follow')
    expect(text).not.toMatch(/native acceleration/iu)
  })
})
