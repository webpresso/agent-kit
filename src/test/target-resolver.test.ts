import { describe, expect, it } from 'vitest'

import { resolveTestTarget } from './target-resolver.js'

describe('resolveTestTarget', () => {
  it('resolves package targets to vp filters', () => {
    expect(resolveTestTarget({ package: ['cli2', '@scope/tool'] })).toEqual({
      type: 'package',
      values: ['cli2', '@scope/tool'],
    })
  })

  it('resolves file targets to direct file paths', () => {
    expect(resolveTestTarget({ file: ['apps/cli2/src/commands/target.test.ts'] })).toEqual({
      type: 'file',
      values: ['apps/cli2/src/commands/target.test.ts'],
    })
  })

  it('infers file targets from path-like positional input', () => {
    expect(resolveTestTarget({ positional: ['packages/example/src/index.test.ts'] })).toEqual({
      type: 'file',
      values: ['packages/example/src/index.test.ts'],
    })
  })

  it('infers package targets from non-file positional input', () => {
    expect(resolveTestTarget({ positional: ['agent-kit'] })).toEqual({
      type: 'package',
      values: ['agent-kit'],
    })
  })

  it('defaults to all when no target is supplied', () => {
    expect(resolveTestTarget({})).toEqual({ type: 'all', values: [] })
  })

  it('rejects mixed package and file targets', () => {
    expect(() =>
      resolveTestTarget({
        package: ['cli2'],
        file: ['apps/cli2/src/commands/target.test.ts'],
      }),
    ).toThrow(/Choose package targets or file targets/)
  })
})
