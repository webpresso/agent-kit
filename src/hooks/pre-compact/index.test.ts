import { beforeEach, describe, expect, it, vi } from 'vitest'

const snapshotMock = vi.hoisted(() => vi.fn())
const computeRepoHashMock = vi.hoisted(() => vi.fn(() => 'precompact000abc1'))

vi.mock('#session-memory/session', () => ({
  snapshot: snapshotMock,
}))

vi.mock('#session-memory/repo-hash', () => ({
  computeRepoHash: computeRepoHashMock,
}))

describe('runPreCompact', () => {
  let runPreCompact: Awaited<typeof import('./index.js')>['runPreCompact']

  beforeEach(async () => {
    vi.resetModules()
    snapshotMock.mockReset()
    computeRepoHashMock.mockReset()
    computeRepoHashMock.mockReturnValue('precompact000abc1')
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const mod = await import('./index.js')
    runPreCompact = mod.runPreCompact
  })

  it('creates a snapshot and logs the result', async () => {
    snapshotMock.mockResolvedValue({
      snapshotId: 'snap-1',
      eventsIncluded: 2,
      partial: false,
    })

    await expect(runPreCompact('/repo')).resolves.toEqual({
      snapshotId: 'snap-1',
      eventsIncluded: 2,
      partial: false,
    })
    expect(computeRepoHashMock).toHaveBeenCalledWith('/repo')
    expect(snapshotMock).toHaveBeenCalledWith({ repoHash: 'precompact000abc1', capMs: 5000 })
  })

  it('returns null when snapshot fails', async () => {
    snapshotMock.mockRejectedValue(new Error('ctx-rs missing'))

    await expect(runPreCompact('/repo')).resolves.toBeNull()
  })
})
