import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CHECKED_DOCS = ['README.md', 'docs/guides/session-memory.md', 'docs/qa-output.md'] as const

describe('session gain docs wording', () => {
  it('does not describe token estimates as exact', () => {
    for (const path of CHECKED_DOCS) {
      expect(existsSync(path), `checked doc missing: ${path}`).toBe(true)
      const text = readFileSync(path, 'utf8')
      expect(text, path).not.toMatch(/exact\s+tokens?|tokens?\s+exact|tokenizer-exact/iu)
    }
  })
})
