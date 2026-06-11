import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyOutputTransform, normalizeToolName } from './index.js'
import { passthroughTransform } from './passthrough.js'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const lintFixturePath = join(fixtureDir, 'oxlint', 'one-error.json')

describe('compact-QA output escape hatch', () => {
  beforeEach(() => {
    delete process.env.QUALITY_ENGINE_COMPACT
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns legacy passthrough/clip output when QUALITY_ENGINE_COMPACT=0', () => {
    const rawOutput = readFileSync(lintFixturePath, 'utf8')

    vi.stubEnv('QUALITY_ENGINE_COMPACT', '0')
    const legacy = applyOutputTransform(rawOutput, {
      toolName: 'wp_lint',
      persistOverflow: false,
    })
    const expected = passthroughTransform(rawOutput, {
      toolName: 'wp_lint',
      normalizedToolName: normalizeToolName('wp_lint'),
      persistOverflow: false,
    })

    expect(legacy).toEqual(expected)
  })

  it('clips long raw output when compacting is disabled', () => {
    const rawOutput = `${'x'.repeat(4_000)}\n${readFileSync(lintFixturePath, 'utf8')}`

    vi.stubEnv('QUALITY_ENGINE_COMPACT', '0')
    const result = applyOutputTransform(rawOutput, {
      toolName: 'wp_unknown-tool',
      maxChars: 3_000,
      persistOverflow: false,
    })

    expect(result.truncated).toBe(true)
    expect(result.rawOutput).toBe(rawOutput.slice(0, 3_000))
    expect(result.transform).toMatchObject({
      toolName: 'wp_unknown-tool',
      normalizedToolName: 'unknown-tool',
      tier: 'passthrough',
    })
  })
})
