import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { oxlintTransform } from './oxlint.js'

describe('oxlintTransform', () => {
  const fixture = (name: string) =>
    readFileSync(join(process.cwd(), 'src/output-transforms/__fixtures__/oxlint', name), 'utf8')

  it('compacts oxlint JSON output into file-line-rule messages', () => {
    const result = oxlintTransform(fixture('one-error.json'), {
      toolName: 'wp_lint-oxlint',
      normalizedToolName: 'lint-oxlint',
    })

    expect(result.rawOutput).toBe('a.ts:2 no-console unexpected console')
    expect(result.transform).toMatchObject({
      normalizedToolName: 'lint-oxlint',
      tier: 'registered',
    })
  })

  it('falls back to error/warning lines when JSON parsing fails', () => {
    const result = oxlintTransform(fixture('malformed.txt'), {
      toolName: 'wp_lint-oxlint',
      normalizedToolName: 'lint-oxlint',
    })

    expect(result.rawOutput).toBe('error: a.ts:2 unexpected console\nwarning: b.ts:7 unused')
  })

  it('accepts diagnostics wrapper output', () => {
    const result = oxlintTransform(fixture('tsgolint-one-error.json'), {
      toolName: 'wp_lint-oxlint',
      normalizedToolName: 'lint-oxlint',
    })

    expect(result.rawOutput).toBe('b.ts:7 correctness/no-unused-vars unused')
  })

  it('handles clean and multi-rule fixtures within the compact budget', () => {
    const clean = oxlintTransform(fixture('clean.json'), {
      toolName: 'wp_lint-oxlint',
      normalizedToolName: 'lint-oxlint',
    })
    const multi = oxlintTransform(fixture('multi-rule.json'), {
      toolName: 'wp_lint-oxlint',
      normalizedToolName: 'lint-oxlint',
    })

    expect(clean.rawOutput).toBe('')
    expect(multi.rawOutput).toContain('a.ts:2 no-console unexpected console')
    expect(Buffer.byteLength(multi.rawOutput ?? '')).toBeLessThanOrEqual(800)
  })
})
