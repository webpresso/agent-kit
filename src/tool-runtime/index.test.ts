import { afterEach, describe, expect, it } from 'vitest'

import { clearManagedRunnerCache, getManagedRunner } from './index.js'

afterEach(() => {
  clearManagedRunnerCache()
})

describe('getManagedRunner', () => {
  it('caches identical resolutions without leaking output mode across cache entries', () => {
    const filtered = getManagedRunner('vitest')
    const filteredAgain = getManagedRunner('vitest')
    const unfiltered = getManagedRunner('vitest', { outputPolicy: 'structured' })

    expect(filteredAgain).toBe(filtered)
    expect(filtered).toEqual({
      tool: 'vitest',
      command: 'rtk',
      args: [expect.stringContaining('vitest')],
      source: 'managed',
    })
    expect(unfiltered).toEqual({
      tool: 'vitest',
      command: expect.stringContaining('vitest'),
      args: [],
      source: 'managed',
    })
    expect(unfiltered).not.toBe(filtered)
  })

  it('supports legacy filterOutput opt-out callers', () => {
    const legacy = getManagedRunner('vitest', { filterOutput: false })
    expect(legacy).toEqual({
      tool: 'vitest',
      command: expect.stringContaining('vitest'),
      args: [],
      source: 'managed',
    })
  })
})
