import { describe, expect, it } from 'vitest'

import { resolveRunner } from './resolve-runner.js'

describe('resolveRunner', () => {
  it('uses RTK-filtered managed runners by default', () => {
    expect(resolveRunner('vitest')).toEqual({
      tool: 'vitest',
      command: 'rtk',
      args: ['vp', 'exec', 'vitest'],
      source: 'managed',
    })
  })

  it('supports explicitly opting out of RTK filtering for managed runners', () => {
    expect(resolveRunner('vitest', { filterOutput: false })).toEqual({
      tool: 'vitest',
      command: 'vp',
      args: ['exec', 'vitest'],
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
})
