import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { genericTransform } from './generic.js'
import { applyOutputTransform } from './index.js'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'generic')

describe('genericTransform', () => {
  it('keeps only error/fail marker lines', () => {
    const rawOutput = readFileSync(join(fixtureDir, 'mixed.txt'), 'utf8')

    const result = genericTransform(rawOutput, {
      toolName: 'ak_err',
      normalizedToolName: 'err',
      persistOverflow: false,
    })

    expect(result.rawOutput).toBe('ERROR: compact this line')
    expect(result.transform).toMatchObject({
      toolName: 'ak_err',
      normalizedToolName: 'err',
      tier: 'registered',
    })
  })

  it('is the fallback for unknown tools', () => {
    const result = applyOutputTransform('ok\nFAIL expected\nignored', {
      toolName: 'ak_unknown-tool',
      persistOverflow: false,
    })

    expect(result.rawOutput).toBe('FAIL expected')
    expect(result.transform).toMatchObject({
      normalizedToolName: 'unknown-tool',
      tier: 'registered',
    })
  })

  it('returns transform metadata even when there are no matching lines', () => {
    const result = genericTransform('all good\nstill fine', {
      toolName: 'ak_err',
      normalizedToolName: 'err',
    })

    expect(result.rawOutput).toBe('')
    expect(result.transform?.rawBytes).toBe(19)
  })
})
