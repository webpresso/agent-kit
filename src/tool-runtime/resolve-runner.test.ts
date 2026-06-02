import { describe, expect, it } from 'vitest'

import { resolveRunner } from './resolve-runner.js'

describe('resolveRunner', () => {
  it('uses RTK-filtered managed runners by default', () => {
    expect(resolveRunner('vitest')).toEqual({
      tool: 'vitest',
      command: 'rtk',
      args: [expect.stringContaining('vitest')],
      source: 'managed',
    })
  })

  it('supports explicitly opting out of RTK filtering for managed runners', () => {
    expect(resolveRunner('vitest', { outputPolicy: 'structured' })).toEqual({
      tool: 'vitest',
      command: expect.stringContaining('vitest'),
      args: [],
      source: 'managed',
    })
  })

  it('resolves tsc through managed vp exec instead of a bare binary', () => {
    expect(resolveRunner('tsc', { outputPolicy: 'structured' })).toEqual({
      tool: 'tsc',
      command: expect.stringContaining('typescript'),
      args: [],
      source: 'managed',
    })
  })

  it('resolves oxfmt through managed vp exec instead of a bare binary', () => {
    expect(resolveRunner('oxfmt', { outputPolicy: 'structured' })).toEqual({
      tool: 'oxfmt',
      command: expect.stringContaining('oxfmt'),
      args: [],
      source: 'managed',
    })
  })

  it('uses the same RTK-default wrapper for fallback runners', () => {
    expect(
      resolveRunner('custom-tool', {
        fallbackCommand: 'vp',
        fallbackArgs: ['exec', 'custom-tool'],
      }),
    ).toEqual({
      tool: 'custom-tool',
      command: 'rtk',
      args: ['vp', 'exec', 'custom-tool'],
      source: 'fallback',
    })
  })

  it('supports explicit structured output for fallback runners', () => {
    expect(
      resolveRunner('custom-tool', {
        fallbackCommand: 'vp',
        fallbackArgs: ['exec', 'custom-tool'],
        outputPolicy: 'structured',
      }),
    ).toEqual({
      tool: 'custom-tool',
      command: 'vp',
      args: ['exec', 'custom-tool'],
      source: 'fallback',
    })
  })

  it('accepts legacy filterOutput false as a structured-output selector', () => {
    expect(resolveRunner('tsc', { filterOutput: false })).toEqual({
      tool: 'tsc',
      command: expect.stringContaining('typescript'),
      args: [],
      source: 'managed',
    })
  })
})
