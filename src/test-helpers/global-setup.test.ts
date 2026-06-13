import { describe, expect, it } from 'vitest'

describe('test global setup', () => {
  it('runs without pre-warming session-memory native addon', async () => {
    const { setup } = await import('./global-setup.js')

    expect(() => setup()).not.toThrow()
  })
})
