import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { vitestTransform } from './vitest.js'

describe('vitestTransform', () => {
  const fixture = (name: string) =>
    readFileSync(join(process.cwd(), 'src/output-transforms/__fixtures__/vitest', name), 'utf8')
  const context = { toolName: 'ak_test', normalizedToolName: 'test' }

  it('emits empty compact output for all-pass JSON', () => {
    expect(vitestTransform(fixture('v2-all-pass.json'), context).rawOutput).toBe('')
    expect(vitestTransform(fixture('v4-all-pass.json'), context).rawOutput).toBe('')
  })

  it('extracts failures from v2 and v4 JSON shapes', () => {
    expect(vitestTransform(fixture('v2-one-fail.json'), context).rawOutput).toContain(
      'adds numbers: expected 1 to be 2',
    )
    expect(vitestTransform(fixture('v4-one-fail.json'), context).rawOutput).toContain(
      'renders: expected true to be false',
    )
  })

  it('extracts JSON from vp-wrapped output', () => {
    expect(vitestTransform(fixture('vp-wrapped.txt'), context).rawOutput).toContain(
      'wrapped fails: boom',
    )
  })

  it('falls back to summary regex lines', () => {
    const result = vitestTransform(fixture('regex-fallback.txt'), context)
    expect(result.rawOutput).toContain('FAIL src/example.test.ts')
  })
})
