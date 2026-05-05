import { describe, expect, it } from 'vitest'

import { auditMutationScore } from './audit-mutation-score.js'
import type { MutationReport } from './audit-mutation-score.js'

function makeReport(
  files: Record<string, Array<{ status: 'Killed' | 'Survived' | 'NoCoverage' | 'Timeout' | 'Ignored' }>>,
): MutationReport {
  return {
    files: Object.fromEntries(
      Object.entries(files).map(([path, mutants]) => [path, { mutants }]),
    ),
  }
}

describe('auditMutationScore', () => {
  it('passes when all thresholds are met', () => {
    const report = makeReport({
      'src/foo.ts': [
        ...Array(95).fill({ status: 'Killed' as const }),
        ...Array(5).fill({ status: 'Survived' as const }),
      ],
    })
    const result = auditMutationScore(report, { minCovered: 90, minRaw: 80, minFile: 85 })
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('fails when covered score is below threshold', () => {
    const report = makeReport({
      'src/foo.ts': [
        ...Array(70).fill({ status: 'Killed' as const }),
        ...Array(30).fill({ status: 'Survived' as const }),
      ],
    })
    const result = auditMutationScore(report, { minCovered: 85, minRaw: 0 })
    expect(result.ok).toBe(false)
    const violation = result.violations.find((v) => v.message.includes('mutation-score-covered'))
    expect(violation).toBeDefined()
    expect(violation?.message).toContain('70.00%')
  })

  it('fails when raw score is below threshold due to no-coverage', () => {
    const report = makeReport({
      'src/foo.ts': [
        ...Array(80).fill({ status: 'Killed' as const }),
        ...Array(10).fill({ status: 'Survived' as const }),
        ...Array(10).fill({ status: 'NoCoverage' as const }),
      ],
    })
    const result = auditMutationScore(report, { minCovered: 0, minRaw: 85 })
    expect(result.ok).toBe(false)
    expect(result.violations.find((v) => v.message.includes('mutation-score-raw'))).toBeDefined()
  })

  it('flags individual files below per-file threshold', () => {
    const report = makeReport({
      'src/good.ts': Array(15).fill({ status: 'Killed' as const }),
      'src/bad.ts': [
        ...Array(5).fill({ status: 'Killed' as const }),
        ...Array(15).fill({ status: 'Survived' as const }),
      ],
    })
    const result = auditMutationScore(report, { minCovered: 0, minRaw: 0, minFile: 85, minMutantsForFileGate: 10 })
    expect(result.ok).toBe(false)
    const fileViolation = result.violations.find((v) => v.message.includes('mutation-score-per-file'))
    expect(fileViolation?.file).toBe('src/bad.ts')
    expect(fileViolation?.message).toContain('25.0%')
  })

  it('skips file gate for files with fewer mutants than minMutantsForFileGate', () => {
    const report = makeReport({
      'src/tiny.ts': [
        { status: 'Survived' as const },
        { status: 'Survived' as const },
      ],
    })
    const result = auditMutationScore(report, { minCovered: 0, minRaw: 0, minFile: 85, minMutantsForFileGate: 10 })
    expect(result.violations.filter((v) => v.message.includes('mutation-score-per-file'))).toHaveLength(0)
  })

  it('reports no-coverage mutants as a violation', () => {
    const report = makeReport({
      'src/uncovered.ts': Array(10).fill({ status: 'NoCoverage' as const }),
    })
    const result = auditMutationScore(report, { minCovered: 0, minRaw: 0 })
    const warning = result.violations.find((v) => v.message.includes('mutation-score-no-cov'))
    expect(warning).toBeDefined()
    expect(warning?.message).toContain('10 mutants')
  })

  it('counts Timeout mutants as Killed', () => {
    const report = makeReport({
      'src/foo.ts': Array(10).fill({ status: 'Timeout' as const }),
    })
    const result = auditMutationScore(report, { minCovered: 95, minRaw: 95 })
    expect(result.ok).toBe(true)
  })

  it('ignores Ignored mutants in score calculation', () => {
    const report = makeReport({
      'src/foo.ts': [
        ...Array(90).fill({ status: 'Killed' as const }),
        ...Array(10).fill({ status: 'Survived' as const }),
        ...Array(100).fill({ status: 'Ignored' as const }),
      ],
    })
    const result = auditMutationScore(report, { minCovered: 85, minRaw: 85 })
    expect(result.ok).toBe(true)
  })

  it('includes title with scores', () => {
    const report = makeReport({
      'src/foo.ts': [
        ...Array(90).fill({ status: 'Killed' as const }),
        ...Array(10).fill({ status: 'Survived' as const }),
      ],
    })
    const result = auditMutationScore(report)
    expect(result.title).toContain('covered=')
    expect(result.title).toContain('raw=')
  })

  it('reports checked count equal to number of files', () => {
    const report = makeReport({
      'src/a.ts': [{ status: 'Killed' as const }],
      'src/b.ts': [{ status: 'Killed' as const }],
    })
    const result = auditMutationScore(report, { minCovered: 0, minRaw: 0 })
    expect(result.checked).toBe(2)
  })
})
