import type { SpawnSyncReturns } from 'node:child_process'

import { describe, expect, it, vi } from 'vitest'

// bun:sqlite is a Bun built-in — stub it for the Node.js/vitest environment
vi.mock('bun:sqlite', () => ({ Database: vi.fn() }))

const spawnSync = vi.hoisted(() => vi.fn<() => SpawnSyncReturns<Buffer>>())

vi.mock('node:child_process', () => ({
  spawnSync,
}))

// Use a non-existent temp dir so queryContextModeStats returns null in unit tests
const NO_CTX_DIRS = ['/tmp/ctx-mode-test-nonexistent-12345'] as const

import { queryContextModeStats, runGain } from './index.js'

describe('queryContextModeStats', () => {
  it('returns null when no session dirs exist', () => {
    expect(queryContextModeStats(['/tmp/nonexistent-ctx-dir-abc'])).toStrictEqual(null)
  })

  it('returns null for empty dirs array', () => {
    expect(queryContextModeStats([])).toStrictEqual(null)
  })
})

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

    const result = runGain(NO_CTX_DIRS)

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

    const result = runGain(NO_CTX_DIRS)

    expect(result).toStrictEqual(0)

    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(logged).toContain('wp setup --with rtk')
    expect(logged).toContain('context-mode')

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

    const result = runGain(NO_CTX_DIRS)

    expect(result).toStrictEqual(1)
  })

  it('shows context-mode not-installed message when no session dirs exist', () => {
    spawnSync.mockReturnValue({
      pid: 123,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
      status: 0,
      error: undefined,
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    runGain(NO_CTX_DIRS)

    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(logged).toContain('context-mode not installed')
    expect(logged).toContain('claude plugin install context-mode')

    logSpy.mockRestore()
  })
})
