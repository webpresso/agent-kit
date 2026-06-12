import { describe, expect, it, vi } from 'vitest'

import type { SpawnSyncReturns } from 'node:child_process'

const spawnSync = vi.hoisted(() => vi.fn<() => SpawnSyncReturns<Buffer>>())

vi.mock('node:child_process', () => ({
  spawnSync,
}))

import { runGain } from './index.js'

describe('runGain', () => {
  it('returns 0 when rtk is available', () => {
    spawnSync.mockReturnValue({
      pid: 123,
      output: [],
      stdout: Buffer.from('Tokens saved: 100k'),
      stderr: Buffer.from(''),
      signal: null,
      status: 0,
      error: undefined,
    })

    const result = runGain()

    expect(result).toStrictEqual(0)
    expect(spawnSync).toHaveBeenCalledWith('rtk', ['gain'], { stdio: 'inherit' })
  })

  it('prints install hint and returns 0 when rtk is not found (ENOENT)', () => {
    const enoentError = Object.assign(new Error('spawn rtk ENOENT'), { code: 'ENOENT' })
    spawnSync.mockReturnValue({
      pid: undefined,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
      status: null,
      error: enoentError,
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const result = runGain()

    expect(result).toStrictEqual(0)

    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(logged).toContain('wp setup --with rtk')

    logSpy.mockRestore()
  })

  it('returns non-zero exit code when rtk exits with failure', () => {
    spawnSync.mockReturnValue({
      pid: 123,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
      status: 1,
      error: undefined,
    })

    const result = runGain()

    expect(result).toStrictEqual(1)
  })
})
