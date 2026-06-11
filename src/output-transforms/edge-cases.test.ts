/**
 * Edge-case test matrix for output transforms.
 *
 * 5 transforms × 7 edge types = 35 cells; N/A cells are noted with comments.
 * 4 PoC tests (marked) capture current behavior for known gaps.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { genericTransform } from './generic.js'
import { oxlintTransform } from './oxlint.js'
import { tscTransform } from './tsc.js'
import { vitestTransform } from './vitest.js'
import { rulesyncTransform } from './rulesync.js'

const FIXTURES_DIR = join(process.cwd(), 'src/output-transforms/__fixtures__/edge')

function edgeFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8')
}

const ctx = (toolName: string) => ({ toolName, normalizedToolName: toolName })

// ---------------------------------------------------------------------------
// vitest transform
// ---------------------------------------------------------------------------

describe('output-transforms edge cases', () => {
  describe('vitest transform', () => {
    it('handles empty output', () => {
      expect(vitestTransform(undefined, ctx('test'))).toEqual({})
      expect(vitestTransform('', ctx('test'))).toEqual({})
    })

    // PoC test 1: ANSI shift in extractJson
    // The ansi-vitest.txt fixture uses literal backslash-x sequences (not real ANSI),
    // so this tests regex-fallback, not JSON parsing. A real ANSI test requires
    // actual escape bytes. Capturing current behavior here.
    it('handles ANSI escape sequences in plain text output (falls back to regex)', () => {
      const raw = edgeFixture('ansi-vitest.txt')
      const result = vitestTransform(raw, ctx('test'))
      // Current behavior: regex fallback picks up FAIL lines
      expect(result).not.toBeNull()
      expect(() => vitestTransform(raw, ctx('test'))).not.toThrow()
    })

    // PoC test 2: 1MB blob — verify no crash and clip works
    it('handles 1MB blob without crashing', () => {
      const raw = 'x'.repeat(1_048_576)
      expect(() => vitestTransform(raw, ctx('test'))).not.toThrow()
      const result = vitestTransform(raw, ctx('test'))
      // No JSON found, no regex matches — passthrough with clip
      expect(result.rawOutput?.length).toBeLessThanOrEqual(4_000 + 1) // 4000 limit + possible off-by-one
    })

    // PoC test 3: Truncated vitest JSON — no infinite loop
    it('handles truncated JSON without hanging', () => {
      const raw = edgeFixture('truncated-vitest-json.txt')
      expect(() => vitestTransform(raw, ctx('test'))).not.toThrow()
    })

    it('handles stderr-only output (regex fallback)', () => {
      const raw = 'Error: cannot find module\nFAIL src/foo.test.ts'
      const result = vitestTransform(raw, ctx('test'))
      expect(() => result).not.toThrow()
    })

    // summary-key-collision: N/A for vitest (no summary key concept)
    // mixed-success-fail: covered by existing vitest.test.ts

    it('handles mixed success and failure output', () => {
      const raw = `[{"id":"a","status":"passed"},{"id":"b","status":"failed","failureMessages":["boom"]}]`
      const result = vitestTransform(raw, ctx('test'))
      expect(result).not.toBe(undefined)
    })
  })

  // ---------------------------------------------------------------------------
  // oxlint transform
  // ---------------------------------------------------------------------------

  describe('oxlint transform', () => {
    it('handles empty output', () => {
      expect(oxlintTransform(undefined, ctx('lint-oxlint'))).toEqual({})
      expect(oxlintTransform('', ctx('lint-oxlint'))).toEqual({})
    })

    it('handles ANSI codes in fallback text (regex-path)', () => {
      const raw = '\x1b[31merror: unexpected console\x1b[0m'
      expect(() => oxlintTransform(raw, ctx('lint-oxlint'))).not.toThrow()
    })

    it('handles 1MB blob without crashing', () => {
      const raw = 'no issues\n'.repeat(100_000)
      expect(() => oxlintTransform(raw, ctx('lint-oxlint'))).not.toThrow()
    })

    it('handles truncated JSON gracefully', () => {
      const raw = '[{"filePath":"a.ts","messages":[{"line":1,"ruleId":"no-co'
      expect(() => oxlintTransform(raw, ctx('lint-oxlint'))).not.toThrow()
    })

    it('handles stderr-only output', () => {
      const raw = 'error: oxlint binary crashed'
      const result = oxlintTransform(raw, ctx('lint-oxlint'))
      expect(result).not.toBe(undefined)
    })

    // summary-key-collision: N/A for oxlint (no summary key)

    it('handles mixed success and failure output', () => {
      const raw =
        '[{"filePath":"ok.ts","messages":[]},{"filePath":"bad.ts","messages":[{"line":3,"ruleId":"no-console","message":"unexpected console"}]}]'
      const result = oxlintTransform(raw, ctx('lint-oxlint'))
      expect(result.failures?.length).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // tsc transform
  // ---------------------------------------------------------------------------

  describe('tsc transform', () => {
    it('handles empty output', () => {
      expect(tscTransform(undefined, ctx('typecheck'))).toEqual({})
      expect(tscTransform('', ctx('typecheck'))).toEqual({})
    })

    it('handles ANSI codes in tsc output (passthrough)', () => {
      const raw = '\x1b[31msrc/foo.ts(1,1): error TS2345: argument\x1b[0m'
      expect(() => tscTransform(raw, ctx('typecheck'))).not.toThrow()
    })

    it('handles 1MB blob without crashing', () => {
      const raw = 'src/foo.ts(1,1): error TS2345: type error\n'.repeat(25_000)
      expect(() => tscTransform(raw, ctx('typecheck'))).not.toThrow()
    })

    it('handles truncated tsc output', () => {
      const raw = 'src/foo.ts(1,1): error TS2345: argu'
      const result = tscTransform(raw, ctx('typecheck'))
      // Incomplete line — may or may not parse; should not throw
      expect(result).not.toBe(undefined)
    })

    it('handles stderr-only (no tsc error format)', () => {
      const raw = 'tsc: command not found'
      const result = tscTransform(raw, ctx('typecheck'))
      // passthrough
      expect(result.rawOutput).toBe(raw)
    })

    // summary-key-collision: N/A for tsc

    it('handles mixed error and clean output', () => {
      const raw = 'src/a.ts(1,1): error TS2345: bad\nsrc/b.ts - Done'
      const result = tscTransform(raw, ctx('typecheck'))
      expect(result.failures?.length).toBeGreaterThan(0)
    })
  })

  // ---------------------------------------------------------------------------
  // generic transform
  // ---------------------------------------------------------------------------

  describe('generic transform', () => {
    it('handles empty output', () => {
      expect(genericTransform(undefined, ctx('e2e'))).toEqual({})
      expect(genericTransform('', ctx('e2e'))).toEqual({})
    })

    it('handles ANSI codes in output', () => {
      const raw = '\x1b[31mERROR: test failed\x1b[0m'
      expect(() => genericTransform(raw, ctx('e2e'))).not.toThrow()
    })

    // PoC test: 1MB blob in genericTransform — verify no crash + clip works
    it('handles 1MB blob without crashing, clips output', () => {
      const raw = 'x'.repeat(1_048_576)
      expect(() => genericTransform(raw, ctx('e2e'))).not.toThrow()
      const result = genericTransform(raw, ctx('e2e'))
      // No error lines — passthrough + clip at 4000
      expect(result.rawOutput?.length).toBeLessThanOrEqual(4_001)
    })

    it('handles truncated output gracefully', () => {
      const raw = 'ERROR: something went wron'
      expect(() => genericTransform(raw, ctx('e2e'))).not.toThrow()
    })

    it('handles stderr-only output with error pattern', () => {
      const raw = 'FAIL: subprocess exited with code 1'
      const result = genericTransform(raw, ctx('e2e'))
      expect(result.failures?.length).toBeGreaterThan(0)
    })

    it('summary-key-collision: multiple identical error messages are all preserved', () => {
      const raw = 'ERROR: module not found\nERROR: module not found'
      const result = genericTransform(raw, ctx('e2e'))
      // Both lines extracted (no deduplication in generic)
      expect(result.failures?.length).toBe(2)
    })

    it('handles mixed success and failure lines', () => {
      const raw = 'ok\nERROR: one failed\ndone'
      const result = genericTransform(raw, ctx('e2e'))
      expect(result.failures?.length).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // rulesync transform
  // ---------------------------------------------------------------------------

  describe('rulesync transform', () => {
    it('handles empty output', () => {
      expect(rulesyncTransform(undefined, ctx('rulesync'))).toEqual({})
      expect(rulesyncTransform('', ctx('rulesync'))).toEqual({})
    })

    it('handles ANSI codes in rulesync output', () => {
      const raw = '\x1b[32m✓\x1b[0m Claude Code: 3 skills, 2 commands, 1 agent\nGenerated in 10ms'
      expect(() => rulesyncTransform(raw, ctx('rulesync'))).not.toThrow()
    })

    it('handles 1MB blob without crashing', () => {
      const raw = '✓ Claude Code: 1 skills, 0 commands, 0 agents\n'.repeat(25_000)
      expect(() => rulesyncTransform(raw, ctx('rulesync'))).not.toThrow()
    })

    it('handles truncated output (incomplete line)', () => {
      const raw = '✓ Claude Code: 3 skills, 2 commands, 1 agent\n✓ Codex: 3 skill'
      expect(() => rulesyncTransform(raw, ctx('rulesync'))).not.toThrow()
    })

    it('handles stderr-only text (no rulesync format — passthrough)', () => {
      const raw = 'rulesync: fatal error initializing'
      const result = rulesyncTransform(raw, ctx('rulesync'))
      // No recognized lines — passthrough
      expect(result.rawOutput).toBe(raw)
    })

    // summary-key-collision: N/A for rulesync

    // PoC test 4: rulesync wrapping — feed rulesync output; verify summary-first envelope
    it('wraps rulesync output with summary-first envelope', () => {
      const raw = edgeFixture('rulesync-success.txt')
      const result = rulesyncTransform(raw, ctx('rulesync'))
      expect(result.rawOutput).not.toBe(undefined)
      // Summary line must appear first
      const firstLine = (result.rawOutput ?? '').split('\n')[0] ?? ''
      expect(firstLine).toContain('rulesync:')
    })

    it('extracts failures from rulesync failure output', () => {
      const raw = edgeFixture('rulesync-failure.txt')
      const result = rulesyncTransform(raw, ctx('rulesync'))
      expect(result.failures?.length).toBe(1)
      expect(result.failures?.[0]?.message).toContain('Cursor')
    })

    it('handles mixed success and failure output', () => {
      const raw = edgeFixture('rulesync-failure.txt')
      const result = rulesyncTransform(raw, ctx('rulesync'))
      expect(result.rawOutput).toContain('rulesync:')
      expect(result.rawOutput).toContain('Claude Code')
      expect(result.rawOutput).toContain('FAILED')
    })
  })
})
