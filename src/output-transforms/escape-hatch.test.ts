import { beforeEach, describe, expect, it, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyOutputTransform } from './index.js'
import { passthroughTransform } from './passthrough.js'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const lintFixturePath = join(fixtureDir, 'oxlint', 'one-error.json')

describe('compact-QA output escape hatch', () => {
  const previousQualityCompact = process.env.QUALITY_ENGINE_COMPACT

  beforeEach(() => {
    delete process.env.QUALITY_ENGINE_COMPACT
  })

  afterEach(() => {
    if (previousQualityCompact === undefined) {
      delete process.env.QUALITY_ENGINE_COMPACT
    } else {
      process.env.QUALITY_ENGINE_COMPACT = previousQualityCompact
    }
  })

  it('returns legacy passthrough/clip output when QUALITY_ENGINE_COMPACT=0', () => {
    const rawOutput = readFileSync(lintFixturePath, 'utf8')

    process.env.QUALITY_ENGINE_COMPACT = '0'
    const legacy = applyOutputTransform(rawOutput, {
      toolName: 'ak_lint',
      persistOverflow: false,
    })
    const expected = passthroughTransform(rawOutput, {
      toolName: 'ak_lint',
      normalizedToolName: 'lint',
      persistOverflow: false,
    })

    expect(legacy).toEqual(expected)
  })

  it('clips long raw output when compacting is disabled', () => {
    const rawOutput = `${'x'.repeat(4_000)}\n${readFileSync(lintFixturePath, 'utf8')}`

    process.env.QUALITY_ENGINE_COMPACT = '0'
    const result = applyOutputTransform(rawOutput, {
      toolName: 'ak_unknown-tool',
      maxChars: 3_000,
      persistOverflow: false,
    })

    expect(result.truncated).toBe(true)
    expect(result.rawOutput).toBe(rawOutput.slice(0, 3_000))
    expect(result.transform).toMatchObject({
      toolName: 'ak_unknown-tool',
      normalizedToolName: 'unknown-tool',
      tier: 'passthrough',
    })
  })
})
