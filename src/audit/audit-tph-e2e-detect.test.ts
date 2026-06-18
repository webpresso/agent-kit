import { describe, expect, it } from 'vitest'

import { detectTphE2eViolations } from './audit-tph-e2e-detect.js'

describe('detectTphE2eViolations', () => {
  it('passes when error and mixed coverage appear in test titles', () => {
    const result = detectTphE2eViolations([
      {
        path: 'src/example.e2e.test.ts',
        contents: `
          describe('example', () => {
            it('handles invalid input', () => {})
            it('degrades gracefully on partial failure', () => {})
          })
        `,
      },
    ])

    expect(result.errorCount).toBe(0)
    expect(result.infoCount).toBe(0)
  })



  it('recognizes table-driven it.each titles as coverage signals', () => {
    const result = detectTphE2eViolations([
      {
        path: 'src/example.e2e.test.ts',
        contents: `
          describe('example', () => {
            it.each(['claude', 'codex'])(
              '%s rejects invalid secret leakage with graceful recovery',
              () => {},
            )
          })
        `,
      },
    ])

    expect(result.errorCount).toBe(0)
    expect(result.infoCount).toBe(0)
  })

  it('flags missing error and mixed coverage heuristics', () => {
    const result = detectTphE2eViolations([
      {
        path: 'src/example.e2e.test.ts',
        contents: `
          describe('example', () => {
            it('works end to end', () => {})
          })
        `,
      },
    ])

    expect(result.infoCount).toBe(2)
    expect(result.violations.map((v) => v.rule)).toEqual([
      'missing-error-coverage',
      'missing-mixed-coverage',
    ])
  })
})
