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

import type { TransformResult } from './index.js'

import { applyOutputTransform, clearTransformsForTest } from './index.js'

afterEach(() => {
  clearTransformsForTest()
})

const RAW_LIMIT = 4_000

const baseContext = {
  persistOverflow: false as const,
}

function transformFor(toolName: string, rawOutput: string | undefined): TransformResult {
  return applyOutputTransform(rawOutput, { toolName, ...baseContext })
}

function expectAbsentRawOutput(result: TransformResult): void {
  expect(result.rawOutput).toBeUndefined()
  expect(result.truncated).toBeUndefined()
}

function expectClippedPassthrough(result: TransformResult, rawBytes: number): void {
  expect(result.rawOutput).toHaveLength(RAW_LIMIT)
  expect(result.truncated).toBe(true)
  expect(result.transform?.rawBytes).toBe(rawBytes)
}

// Tool names that hit different normalize paths in the dispatcher.
const TOOL_NAMES_HITTING_GENERIC = [
  'wp_e2e',
  'wp_audit-tph-e2e',
  'wp_audit-blueprint-lifecycle',
  'wp_custom',
  'wp_unknown-tool',
] as const

// Tool names with built-in transforms (different fallback path).
const TOOL_NAMES_HITTING_BUILTIN = ['wp_typecheck', 'wp_test', 'wp_lint-oxlint'] as const

describe('output-transform contract — empty input', () => {
  for (const toolName of [...TOOL_NAMES_HITTING_GENERIC, ...TOOL_NAMES_HITTING_BUILTIN]) {
    it(`${toolName}: empty rawOutput returns {} with no rawOutput key`, () => {
      // Contract: `rawOutput` MUST NOT appear as `''` — it should be absent.
      // We previously had a bug where empty inputs sometimes returned `rawOutput: ''`,
      // which downstream consumers mistakenly treated as "ran but produced nothing".
      expectAbsentRawOutput(transformFor(toolName, undefined))
      expectAbsentRawOutput(transformFor(toolName, ''))
    })
  }
})

describe('output-transform contract — short output, no error patterns', () => {
  // The bug we just fixed: tools without registered transforms used to return
  // `rawOutput: ''` when no error-like lines matched. Contract is now passthrough.
  const shortHappy = 'all good\nstill fine'

  for (const toolName of TOOL_NAMES_HITTING_GENERIC) {
    it(`${toolName}: returns full raw via passthrough when no error patterns match`, () => {
      const result = transformFor(toolName, shortHappy)

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
    const result = transformFor('wp_custom', raw)

    expect(result.rawOutput).toBe('ERROR one\nFAIL two')
    expect(result.failures).toEqual([{ message: 'ERROR one' }, { message: 'FAIL two' }])
    expect(result.transform?.rawBytes).toBe(Buffer.byteLength(raw))
  })
})

describe('output-transform contract — overflow', () => {
  // For any tool, a 5000-char rawOutput with no diagnostics should still
  // produce a clipped 4000-char rawOutput marked truncated. This is the
  // exact regression that broke wp_e2e and wp_audit-tph-e2e tests.
  for (const toolName of TOOL_NAMES_HITTING_GENERIC) {
    it(`${toolName}: clips long output and marks truncated`, () => {
      const raw = 'x'.repeat(5_000)
      expectClippedPassthrough(transformFor(toolName, raw), raw.length)
    })
  }

  it('typecheck (registered transform): clips passthrough fallback when no errors found', () => {
    const raw = 'x'.repeat(5_000)
    expectClippedPassthrough(transformFor('wp_typecheck', raw), raw.length)
  })
})

describe('output-transform contract — rawBytes accounting', () => {
  // The transform metadata's rawBytes field MUST always reflect the *input*
  // byte count, never the post-clip output. Downstream telemetry depends on
  // this to compute tokensSaved correctly.
  it('rawBytes reflects input bytes regardless of compaction', () => {
    const raw = 'ok\nERROR one'
    const result = transformFor('wp_custom', raw)

    expect(result.transform?.rawBytes).toBe(12)
    expect(result.bytes).toBeLessThanOrEqual(12)
    expect(result.tokensSaved).toBeGreaterThanOrEqual(0)
    expect(result.tokensSaved).toBeLessThanOrEqual(12)
  })

  it('rawBytes reflects input even after clip-to-4000', () => {
    const raw = 'x'.repeat(5_000)
    const result = transformFor('wp_custom', raw)

    expect(result.transform?.rawBytes).toBe(5_000)
  })
})
