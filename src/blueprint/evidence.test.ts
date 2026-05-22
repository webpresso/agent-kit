/**
 * Evidence Contract zod schema tests (F10/R8/E14).
 *
 * The contract is the load-bearing surface: agents must not be able to mark
 * a task done with empty/trivial evidence. These tests pin the rules.
 */

import { describe, expect, it } from 'vitest'

import {
  canonicalizeEvidence,
  canonicalizeEvidenceList,
  evidenceSchema,
  evidenceListSchema,
  type Evidence,
} from './evidence.js'

const TS = '2026-05-13T12:00:00.000Z'

describe('evidenceSchema', () => {
  describe('test kind', () => {
    it('parses a valid passing test evidence', () => {
      const value: Evidence = {
        kind: 'test',
        result: 'pass',
        command: 'wp_test --package agent-kit',
        exit_code: 0,
        ts: TS,
      }
      expect(evidenceSchema.parse(value)).toStrictEqual(value)
    })

    it('rejects test evidence missing command', () => {
      const result = evidenceSchema.safeParse({
        kind: 'test',
        result: 'pass',
        exit_code: 0,
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects passing test evidence with non-zero exit_code', () => {
      const result = evidenceSchema.safeParse({
        kind: 'test',
        result: 'pass',
        command: 'wp_test',
        exit_code: 1,
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects test evidence missing exit_code', () => {
      const result = evidenceSchema.safeParse({
        kind: 'test',
        result: 'pass',
        command: 'wp_test',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('accepts a failing test evidence with non-zero exit_code', () => {
      const value: Evidence = {
        kind: 'test',
        result: 'fail',
        command: 'wp_test',
        exit_code: 1,
        ts: TS,
      }
      expect(evidenceSchema.parse(value)).toStrictEqual(value)
    })
  })

  describe('integration kind', () => {
    it('parses a valid integration evidence with target_files', () => {
      const value: Evidence = {
        kind: 'integration',
        result: 'pass',
        command: 'wp_test --suite integration',
        exit_code: 0,
        target_files: ['src/foo.integration.test.ts'],
        ts: TS,
      }
      expect(evidenceSchema.parse(value)).toStrictEqual(value)
    })

    it('rejects integration evidence with empty target_files', () => {
      const result = evidenceSchema.safeParse({
        kind: 'integration',
        result: 'pass',
        command: 'wp_test',
        exit_code: 0,
        target_files: [],
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects integration evidence missing target_files', () => {
      const result = evidenceSchema.safeParse({
        kind: 'integration',
        result: 'pass',
        command: 'wp_test',
        exit_code: 0,
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects passing integration evidence with non-zero exit_code', () => {
      const result = evidenceSchema.safeParse({
        kind: 'integration',
        result: 'pass',
        command: 'wp_test',
        exit_code: 2,
        target_files: ['src/foo.integration.test.ts'],
        ts: TS,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('audit kind', () => {
    it('parses a valid audit evidence', () => {
      const value: Evidence = {
        kind: 'audit',
        result: 'pass',
        audit_kind: 'tph-e2e',
        passed: true,
        ts: TS,
      }
      expect(evidenceSchema.parse(value)).toStrictEqual(value)
    })

    it('rejects audit evidence missing audit_kind', () => {
      const result = evidenceSchema.safeParse({
        kind: 'audit',
        result: 'pass',
        passed: true,
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects passing audit evidence with passed: false', () => {
      const result = evidenceSchema.safeParse({
        kind: 'audit',
        result: 'pass',
        audit_kind: 'blueprint-lifecycle',
        passed: false,
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects audit evidence missing passed flag', () => {
      const result = evidenceSchema.safeParse({
        kind: 'audit',
        result: 'pass',
        audit_kind: 'tph-e2e',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('accepts a failing audit evidence with passed: false', () => {
      const value: Evidence = {
        kind: 'audit',
        result: 'fail',
        audit_kind: 'tph-e2e',
        passed: false,
        ts: TS,
      }
      expect(evidenceSchema.parse(value)).toStrictEqual(value)
    })
  })

  describe('manual kind', () => {
    it('parses a valid manual evidence with allow_manual: true', () => {
      const value: Evidence = {
        kind: 'manual',
        result: 'pass',
        actor: 'ozby',
        description: 'Opened the design surface in browser and verified palette renders.',
        allow_manual: true,
        log_excerpt: 'Verified rendered palette matches DESIGN.md',
        ts: TS,
      }
      expect(evidenceSchema.parse(value)).toStrictEqual(value)
    })

    it('rejects manual evidence missing allow_manual flag (anti-shortcut)', () => {
      const result = evidenceSchema.safeParse({
        kind: 'manual',
        result: 'pass',
        actor: 'ozby',
        description: 'Looked at it.',
        log_excerpt: 'looked at it',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects manual evidence with allow_manual: false (anti-shortcut)', () => {
      const result = evidenceSchema.safeParse({
        kind: 'manual',
        result: 'pass',
        actor: 'ozby',
        description: 'Looked at it.',
        allow_manual: false,
        log_excerpt: 'looked at it',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects manual evidence missing actor', () => {
      const result = evidenceSchema.safeParse({
        kind: 'manual',
        result: 'pass',
        description: 'X',
        allow_manual: true,
        log_excerpt: 'log',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects manual evidence missing description', () => {
      const result = evidenceSchema.safeParse({
        kind: 'manual',
        result: 'pass',
        actor: 'ozby',
        allow_manual: true,
        log_excerpt: 'log',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects manual evidence with empty log_excerpt', () => {
      const result = evidenceSchema.safeParse({
        kind: 'manual',
        result: 'pass',
        actor: 'ozby',
        description: 'X',
        allow_manual: true,
        log_excerpt: '',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects manual evidence with log_excerpt > 4 KiB', () => {
      const huge = 'x'.repeat(4097)
      const result = evidenceSchema.safeParse({
        kind: 'manual',
        result: 'pass',
        actor: 'ozby',
        description: 'X',
        allow_manual: true,
        log_excerpt: huge,
        ts: TS,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('trivial-forgery rejection', () => {
    it('rejects `{ ok: true }` payload', () => {
      const result = evidenceSchema.safeParse({ ok: true })
      expect(result.success).toBe(false)
    })

    it('rejects empty object', () => {
      const result = evidenceSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects unknown kind value', () => {
      const result = evidenceSchema.safeParse({
        kind: 'bogus',
        result: 'pass',
        ts: TS,
      })
      expect(result.success).toBe(false)
    })

    it('rejects evidence missing ts', () => {
      const result = evidenceSchema.safeParse({
        kind: 'test',
        result: 'pass',
        command: 'wp_test',
        exit_code: 0,
      })
      expect(result.success).toBe(false)
    })

    it('rejects ts that is not ISO-8601', () => {
      const result = evidenceSchema.safeParse({
        kind: 'test',
        result: 'pass',
        command: 'wp_test',
        exit_code: 0,
        ts: 'not-a-date',
      })
      expect(result.success).toBe(false)
    })
  })
})

describe('evidenceListSchema', () => {
  it('rejects an empty evidence array', () => {
    const result = evidenceListSchema.safeParse([])
    expect(result.success).toBe(false)
  })

  it('accepts a non-empty array', () => {
    const value: Evidence[] = [
      { kind: 'test', result: 'pass', command: 'wp_test', exit_code: 0, ts: TS },
    ]
    const parsed = evidenceListSchema.parse(value)
    expect(parsed).toHaveLength(1)
  })
})

describe('canonicalizeEvidence', () => {
  it('produces stable JSON across key order', () => {
    const a: Evidence = {
      kind: 'test',
      result: 'pass',
      command: 'wp_test',
      exit_code: 0,
      ts: TS,
    }
    const b: Evidence = {
      ts: TS,
      exit_code: 0,
      command: 'wp_test',
      result: 'pass',
      kind: 'test',
    }
    expect(canonicalizeEvidence(a)).toBe(canonicalizeEvidence(b))
  })

  it('normalizes nested arrays consistently', () => {
    const a: Evidence = {
      kind: 'integration',
      result: 'pass',
      command: 'wp_test',
      exit_code: 0,
      target_files: ['b.ts', 'a.ts'],
      ts: TS,
    }
    const b: Evidence = {
      kind: 'integration',
      result: 'pass',
      command: 'wp_test',
      exit_code: 0,
      target_files: ['b.ts', 'a.ts'],
      ts: TS,
    }
    expect(canonicalizeEvidence(a)).toBe(canonicalizeEvidence(b))
  })

  it('produces JSON parseable back to the same shape', () => {
    const value: Evidence = {
      kind: 'audit',
      result: 'pass',
      audit_kind: 'tph-e2e',
      passed: true,
      ts: TS,
    }
    const round = JSON.parse(canonicalizeEvidence(value))
    expect(evidenceSchema.parse(round)).toStrictEqual(value)
  })
})

describe('canonicalizeEvidenceList', () => {
  it('canonicalizes each item with stable ordering', () => {
    const list: Evidence[] = [
      { kind: 'test', result: 'pass', command: 'wp_test', exit_code: 0, ts: TS },
      {
        kind: 'audit',
        result: 'pass',
        audit_kind: 'tph-e2e',
        passed: true,
        ts: TS,
      },
    ]
    const serialized = canonicalizeEvidenceList(list)
    const reparsed = JSON.parse(serialized)
    expect(reparsed).toHaveLength(2)
    expect(evidenceListSchema.parse(reparsed)).toStrictEqual(list)
  })

  it('is byte-stable for identical input', () => {
    const list: Evidence[] = [
      { kind: 'test', result: 'pass', command: 'wp_test', exit_code: 0, ts: TS },
    ]
    expect(canonicalizeEvidenceList(list)).toBe(canonicalizeEvidenceList(list))
  })
})
