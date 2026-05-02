/**
 * Export-isolation guard for `@webpresso/agent-kit/typecheck`.
 *
 * Pins the public surface of the `./typecheck` subpath: framework consumers
 * (Wave 2 scaffolders) rely on `runTypecheck(options): Promise<TypecheckResult>`
 * and the `parseTscOutput` helper. Any rename, removal, or shape change
 * fails this test before it reaches a consumer.
 */

import { describe, expect, it } from 'vitest'

import * as typecheckModule from './index.js'
import { parseTscOutput, runTypecheck } from './index.js'

describe('@webpresso/agent-kit/typecheck export surface', () => {
  it('exports runTypecheck as a function', () => {
    expect(typeof runTypecheck).toBe('function')
    expect(runTypecheck.length).toBeLessThanOrEqual(1)
  })

  it('exports parseTscOutput as a function', () => {
    expect(typeof parseTscOutput).toBe('function')
  })

  it('exposes exactly the documented named exports', () => {
    const exported = Object.keys(typecheckModule).sort()
    expect(exported).toEqual(['parseTscOutput', 'runTypecheck'].sort())
  })

  it('parseTscOutput returns an empty array for empty input', () => {
    expect(parseTscOutput('')).toEqual([])
  })

  it('parseTscOutput parses the parenthesized tsc diagnostic format', () => {
    const raw = `src/foo.ts(5,12): error TS2304: Cannot find name 'bar'.`
    expect(parseTscOutput(raw)).toEqual([
      { file: 'src/foo.ts', line: 5, code: '2304', message: "Cannot find name 'bar'." },
    ])
  })

  it('parseTscOutput parses the colon tsc diagnostic format', () => {
    const raw = `src/foo.ts:7:1 - error TS2305: Module '"./x"' has no exported member 'Y'.`
    expect(parseTscOutput(raw)).toEqual([
      {
        file: 'src/foo.ts',
        line: 7,
        code: '2305',
        message: `Module '"./x"' has no exported member 'Y'.`,
      },
    ])
  })

  it('parseTscOutput skips non-diagnostic lines (preamble, blank, summary)', () => {
    const raw = [
      '',
      'Compiling...',
      'src/foo.ts(5,12): error TS2304: Cannot find name \'bar\'.',
      'Found 1 error.',
    ].join('\n')
    const errors = parseTscOutput(raw)
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('2304')
  })

  it('parseTscOutput accumulates multiple diagnostics', () => {
    const raw = [
      'src/a.ts(1,1): error TS1: msg a',
      'src/b.ts:2:2 - error TS22: msg b',
    ].join('\n')
    const errors = parseTscOutput(raw)
    expect(errors).toEqual([
      { file: 'src/a.ts', line: 1, code: '1', message: 'msg a' },
      { file: 'src/b.ts', line: 2, code: '22', message: 'msg b' },
    ])
  })
})
