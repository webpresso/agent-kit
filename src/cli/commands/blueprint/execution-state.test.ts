import { describe, expect, it } from 'vitest'

import {
  assertCompletionEvidence,
  mergeExecutionArtifacts,
  normalizeCompletionEvidence,
  normalizeEvidenceArray,
} from './execution-state.js'

// ---------------------------------------------------------------------------
// normalizeEvidenceArray
// ---------------------------------------------------------------------------

describe('normalizeEvidenceArray', () => {
  it('trims whitespace', () => {
    expect(normalizeEvidenceArray(['  a  ', 'b'])).toEqual(['a', 'b'])
  })

  it('filters empty strings after trim', () => {
    expect(normalizeEvidenceArray(['a', '', '   '])).toEqual(['a'])
  })

  it('returns empty array for all-empty input', () => {
    expect(normalizeEvidenceArray(['', '  '])).toEqual([])
  })

  it('preserves non-empty items', () => {
    expect(normalizeEvidenceArray(['foo', 'bar'])).toEqual(['foo', 'bar'])
  })
})

// ---------------------------------------------------------------------------
// normalizeCompletionEvidence
// ---------------------------------------------------------------------------

describe('normalizeCompletionEvidence', () => {
  it('normalizes artifacts and verifications arrays', () => {
    const result = normalizeCompletionEvidence({
      artifacts: ['  dist/a.js  ', ''],
      verifications: ['pnpm test', '  '],
    })
    expect(result.artifacts).toEqual(['dist/a.js'])
    expect(result.verifications).toEqual(['pnpm test'])
  })

  it('trims logPath and returns undefined when empty', () => {
    const result = normalizeCompletionEvidence({
      artifacts: [],
      verifications: [],
      logPath: '   ',
    })
    expect(result.logPath).toBeUndefined()
  })

  it('preserves non-empty logPath after trim', () => {
    const result = normalizeCompletionEvidence({
      artifacts: [],
      verifications: [],
      logPath: '  logs/run.log  ',
    })
    expect(result.logPath).toBe('logs/run.log')
  })

  it('returns undefined logPath when not provided', () => {
    const result = normalizeCompletionEvidence({ artifacts: [], verifications: [] })
    expect(result.logPath).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// mergeExecutionArtifacts
// ---------------------------------------------------------------------------

describe('mergeExecutionArtifacts', () => {
  it('merges artifacts from null current', () => {
    const result = mergeExecutionArtifacts(null, {
      artifacts: ['a.js'],
      verifications: ['pnpm test'],
    })
    expect(result.artifacts).toEqual(['a.js'])
    expect(result.verifications).toEqual(['pnpm test'])
  })

  it('deduplicates artifacts across current and next', () => {
    const result = mergeExecutionArtifacts(
      { artifacts: ['a.js', 'b.js'], verifications: ['v1'] },
      { artifacts: ['b.js', 'c.js'], verifications: ['v1', 'v2'] },
    )
    expect(result.artifacts).toEqual(['a.js', 'b.js', 'c.js'])
    expect(result.verifications).toEqual(['v1', 'v2'])
  })

  it('prefers next logPath over current logPath', () => {
    const result = mergeExecutionArtifacts(
      { artifacts: [], verifications: [], logPath: 'old.log' },
      { artifacts: [], verifications: [], logPath: 'new.log' },
    )
    expect(result.logPath).toBe('new.log')
  })

  it('falls back to current logPath when next has no logPath', () => {
    const result = mergeExecutionArtifacts(
      { artifacts: [], verifications: [], logPath: 'existing.log' },
      { artifacts: [], verifications: [] },
    )
    expect(result.logPath).toBe('existing.log')
  })

  it('normalizes whitespace in next evidence', () => {
    const result = mergeExecutionArtifacts(null, {
      artifacts: ['  a.js  ', ''],
      verifications: ['  v1  ', ''],
    })
    expect(result.artifacts).toEqual(['a.js'])
    expect(result.verifications).toEqual(['v1'])
  })
})

// ---------------------------------------------------------------------------
// assertCompletionEvidence
// ---------------------------------------------------------------------------

describe('assertCompletionEvidence', () => {
  it('returns evidence when valid', () => {
    const evidence = {
      artifacts: ['dist/app.js'],
      verifications: ['pnpm test'],
    }
    expect(assertCompletionEvidence(evidence, 'exec-123')).toBe(evidence)
  })

  it('throws when verifications is empty', () => {
    expect(() =>
      assertCompletionEvidence(
        { artifacts: ['dist/app.js'], verifications: [] },
        'exec-123',
      ),
    ).toThrow(/cannot record completion without named verification output/)
  })

  it('throws when null evidence', () => {
    expect(() => assertCompletionEvidence(null, 'exec-123')).toThrow(
      /cannot record completion without named verification output/,
    )
  })

  it('throws when no artifacts and no logPath', () => {
    expect(() =>
      assertCompletionEvidence(
        { artifacts: [], verifications: ['pnpm test'] },
        'exec-123',
      ),
    ).toThrow(/cannot record completion without artifact or log identity/)
  })

  it('passes when no artifacts but logPath present', () => {
    const evidence = {
      artifacts: [],
      verifications: ['pnpm test'],
      logPath: 'logs/run.log',
    }
    expect(assertCompletionEvidence(evidence, 'exec-123')).toBe(evidence)
  })

  it('includes executionId in error message', () => {
    expect(() =>
      assertCompletionEvidence(null, 'my-exec-id'),
    ).toThrow(/my-exec-id/)
  })
})
