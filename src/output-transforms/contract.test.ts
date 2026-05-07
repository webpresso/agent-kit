/**
 * Output-transform contract tests.
 *
 * Pins down the invariants every transform path through `applyOutputTransform`
 * MUST honor — exists because we previously had two test suites asserting
 * contradictory expectations for the no-error-pattern case (one expected
 * `rawOutput === ''`, another expected the original raw to flow through).
 *
 * Any future divergence between transforms should fail HERE, not in a
 * downstream MCP tool test, so the broken contract is visible at the
 * dispatcher boundary.
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  applyOutputTransform,
  clearTransformsForTest,
} from './index.js'

afterEach(() => {
  clearTransformsForTest()
})

const RAW_LIMIT = 4_000

const baseContext = {
  persistOverflow: false as const,
}

// Tool names that hit different normalize paths in the dispatcher.
const TOOL_NAMES_HITTING_GENERIC = [
  'ak_e2e',
  'ak_audit-tph-e2e',
  'ak_audit-blueprint-lifecycle',
  'ak_custom',
  'ak_unknown-tool',
] as const

// Tool names with built-in transforms (different fallback path).
const TOOL_NAMES_HITTING_BUILTIN = [
  'ak_typecheck',
  'ak_test',
  'ak_lint-oxlint',
] as const

describe('output-transform contract — empty input', () => {
  for (const toolName of [...TOOL_NAMES_HITTING_GENERIC, ...TOOL_NAMES_HITTING_BUILTIN]) {
    it(`${toolName}: empty rawOutput returns {} with no rawOutput key`, () => {
      const undefResult = applyOutputTransform(undefined, { toolName, ...baseContext })
      const emptyResult = applyOutputTransform('', { toolName, ...baseContext })

      // Contract: `rawOutput` MUST NOT appear as `''` — it should be absent.
      // We previously had a bug where empty inputs sometimes returned `rawOutput: ''`,
      // which downstream consumers mistakenly treated as "ran but produced nothing".
      expect(undefResult.rawOutput).toBeUndefined()
      expect(undefResult.truncated).toBeUndefined()
      expect(emptyResult.rawOutput).toBeUndefined()
      expect(emptyResult.truncated).toBeUndefined()
    })
  }
})

describe('output-transform contract — short output, no error patterns', () => {
  // The bug we just fixed: tools without registered transforms used to return
  // `rawOutput: ''` when no error-like lines matched. Contract is now passthrough.
  const shortHappy = 'all good\nstill fine'

  for (const toolName of TOOL_NAMES_HITTING_GENERIC) {
    it(`${toolName}: returns full raw via passthrough when no error patterns match`, () => {
      const result = applyOutputTransform(shortHappy, { toolName, ...baseContext })

      expect(result.rawOutput).toBe(shortHappy)
      expect(result.truncated).toBeUndefined()
      // rawBytes always equals the original byte count, regardless of the path taken.
      expect(result.transform?.rawBytes).toBe(Buffer.byteLength(shortHappy))
    })
  }
})

describe('output-transform contract — short output, with error patterns', () => {
  it('generic-fallback tools: extract failure lines into rawOutput', () => {
    const raw = 'ok\nERROR one\nFAIL two\nignored'
    const result = applyOutputTransform(raw, { toolName: 'ak_custom', ...baseContext })

    expect(result.rawOutput).toBe('ERROR one\nFAIL two')
    expect(result.failures).toEqual([
      { message: 'ERROR one' },
      { message: 'FAIL two' },
    ])
    expect(result.transform?.rawBytes).toBe(Buffer.byteLength(raw))
  })
})

describe('output-transform contract — overflow', () => {
  // For any tool, a 5000-char rawOutput with no diagnostics should still
  // produce a clipped 4000-char rawOutput marked truncated. This is the
  // exact regression that broke ak_e2e and ak_audit-tph-e2e tests.
  for (const toolName of TOOL_NAMES_HITTING_GENERIC) {
    it(`${toolName}: clips long output and marks truncated`, () => {
      const raw = 'x'.repeat(5_000)
      const result = applyOutputTransform(raw, { toolName, ...baseContext })

      expect(result.rawOutput).toHaveLength(RAW_LIMIT)
      expect(result.truncated).toBe(true)
      expect(result.transform?.rawBytes).toBe(5_000)
    })
  }

  it('typecheck (registered transform): clips passthrough fallback when no errors found', () => {
    const raw = 'x'.repeat(5_000)
    const result = applyOutputTransform(raw, { toolName: 'ak_typecheck', ...baseContext })

    expect(result.rawOutput).toHaveLength(RAW_LIMIT)
    expect(result.truncated).toBe(true)
  })
})

describe('output-transform contract — rawBytes accounting', () => {
  // The transform metadata's rawBytes field MUST always reflect the *input*
  // byte count, never the post-clip output. Downstream telemetry depends on
  // this to compute tokensSaved correctly.
  it('rawBytes reflects input bytes regardless of compaction', () => {
    const raw = 'ok\nERROR one'
    const result = applyOutputTransform(raw, { toolName: 'ak_custom', ...baseContext })

    expect(result.transform?.rawBytes).toBe(12)
    expect(result.bytes).toBeLessThanOrEqual(12)
    expect(result.tokensSaved).toBeGreaterThanOrEqual(0)
    expect(result.tokensSaved).toBeLessThanOrEqual(12)
  })

  it('rawBytes reflects input even after clip-to-4000', () => {
    const raw = 'x'.repeat(5_000)
    const result = applyOutputTransform(raw, { toolName: 'ak_custom', ...baseContext })

    expect(result.transform?.rawBytes).toBe(5_000)
  })
})
