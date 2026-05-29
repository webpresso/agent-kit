import { afterEach, describe, expect, it } from 'vitest'

import { clearManagedRunnerCache, getManagedRunner } from './index.js'

afterEach(() => {
  clearManagedRunnerCache()
})

describe('getManagedRunner', () => {
  it('caches identical resolutions without leaking the RTK opt-out flag across cache entries', () => {
    const filtered = getManagedRunner('vitest')
    const filteredAgain = getManagedRunner('vitest')
    const unfiltered = getManagedRunner('vitest', { filterOutput: false })

    expect(filteredAgain).toBe(filtered)
    expect(filtered).toEqual({
      tool: 'vitest',
      command: 'rtk',
      args: ['vp', 'exec', 'vitest'],
      source: 'managed',
    })
    expect(unfiltered).toEqual({
      tool: 'vitest',
      command: 'vp',
      args: ['exec', 'vitest'],
      source: 'managed',
    })
    expect(unfiltered).not.toBe(filtered)
  })
})
