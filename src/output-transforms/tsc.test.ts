import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { tscTransform } from './tsc.js'

describe('tscTransform', () => {
  const fixture = (name: string) =>
    readFileSync(join(process.cwd(), 'src/output-transforms/__fixtures__/tsc', name), 'utf8')

  it('compacts tsc diagnostics and collapses duplicates', () => {
    const raw = [
      'src/a.ts(2,4): error TS2322: Type string is not assignable to number.',
      'src/a.ts(2,4): error TS2322: Type string is not assignable to number.',
      'src/b.ts:7:1 - error TS2304: Cannot find name nope.',
    ].join('\n')

    const result = tscTransform(raw, {
      toolName: 'ak_typecheck',
      normalizedToolName: 'typecheck',
    })

    expect(result.rawOutput).toBe(
      [
        'src/a.ts:2 TS2322 Type string is not assignable to number. (x2)',
        'src/b.ts:7 TS2304 Cannot find name nope.',
      ].join('\n'),
    )
  })

  it('falls back to passthrough when no diagnostics are found', () => {
    const clean = tscTransform(fixture('clean.txt'), {
      toolName: 'ak_typecheck',
      normalizedToolName: 'typecheck',
      persistOverflow: false,
    })
    const result = tscTransform('x'.repeat(5_000), {
      toolName: 'ak_typecheck',
      normalizedToolName: 'typecheck',
      persistOverflow: false,
    })

    expect(clean.rawOutput?.trim()).toBe('Found 0 errors.')
    expect(result.rawOutput).toHaveLength(4_000)
    expect(result.truncated).toBe(true)
  })

  it('keeps one-error and cascade fixtures within budget', () => {
    const one = tscTransform(fixture('one-error.txt'), {
      toolName: 'ak_typecheck',
      normalizedToolName: 'typecheck',
    })
    const cascade = tscTransform(fixture('cascade.txt'), {
      toolName: 'ak_typecheck',
      normalizedToolName: 'typecheck',
    })

    expect(Buffer.byteLength(one.rawOutput ?? '')).toBeLessThanOrEqual(400)
    expect(cascade.rawOutput).toContain('(x8)')
    expect(Buffer.byteLength(cascade.rawOutput ?? '')).toBeLessThanOrEqual(800)
  })

  it('handles multi-file and colon-format fixtures', () => {
    const multi = tscTransform(fixture('multi-file.txt'), {
      toolName: 'ak_typecheck',
      normalizedToolName: 'typecheck',
    })
    const colon = tscTransform(fixture('colon-format.txt'), {
      toolName: 'ak_typecheck',
      normalizedToolName: 'typecheck',
    })

    expect(multi.rawOutput).toContain('src/c.ts:4 TS7006')
    expect(colon.rawOutput).toBe('src/foo.ts:5 TS2304 Cannot find name missing.')
  })
})
