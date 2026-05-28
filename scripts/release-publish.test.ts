import { afterEach, describe, expect, it, vi } from 'vitest'

const mockWrite = vi.fn()
const mockSpawnSync = vi.fn()

vi.mock('node:child_process', () => ({
  spawnSync: mockSpawnSync,
}))

async function importScript() {
  vi.resetModules()
  return import('./release-publish.ts')
}

describe('scripts/release-publish.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mockSpawnSync.mockReset()
    mockWrite.mockReset()
  })

  it('treats already-published npm responses as success', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(mockWrite)
    vi.spyOn(process.stderr, 'write').mockImplementation(mockWrite)
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`EXIT:${code ?? 0}`)
    })
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'npm error You cannot publish over the previously published versions: 0.21.4.',
      })

    await expect(importScript()).rejects.toThrow('EXIT:0')
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      'pnpm',
      ['run', 'build'],
      expect.objectContaining({ encoding: 'utf8', stdio: 'pipe' }),
    )
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['publish', '--provenance', '--access', 'public'],
      expect.objectContaining({ encoding: 'utf8', stdio: 'pipe' }),
    )
  })

  it('fails when npm publish fails for another reason', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(mockWrite)
    vi.spyOn(process.stderr, 'write').mockImplementation(mockWrite)
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`EXIT:${code ?? 0}`)
    })
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'npm error code E404',
      })

    await expect(importScript()).rejects.toThrow('EXIT:1')
  })
})
