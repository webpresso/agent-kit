import { afterEach, describe, expect, it, vi } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'

import { runFormat } from './index.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

installManagedRunnerHermeticHooks({ rtkAvailable: false })

function fakeChild(
  opts: {
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: NodeJS.ErrnoException
  } = {},
): unknown {
  return {
    stdout: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stdout) fn(Buffer.from(opts.stdout))
      },
    },
    stderr: {
      on: (event: string, fn: (data: Buffer) => void) => {
        if (event === 'data' && opts.stderr) fn(Buffer.from(opts.stderr))
      },
    },
    on: (event: string, fn: (arg: unknown) => void) => {
      if (event === 'error' && opts.error) {
        queueMicrotask(() => fn(opts.error))
        return
      }
      if (event === 'close' && !opts.error) {
        queueMicrotask(() => fn(opts.exitCode ?? 0))
      }
    },
  }
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('runFormat', () => {
  it('delegates formatting to the managed formatter backend', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: 'Finished\n', exitCode: 0 }))

    const result = await runFormat({ files: ['src'] })

    expect(result).toMatchObject({
      passed: true,
      exitCode: 0,
      output: 'Finished\n',
    })
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toContain('oxfmt')
    expect(args).toEqual(['--write', '--ignore-path', '.gitignore', 'src'])
  })

  it('forwards check mode to the managed formatter backend', async () => {
    spawnMock.mockReturnValue(fakeChild({ stderr: 'needs formatting\n', exitCode: 1 }))

    const result = await runFormat({ check: true, files: ['src'] })

    expect(result).toMatchObject({
      passed: false,
      exitCode: 1,
    })
    const [, args] = spawnMock.mock.calls[0]!
    expect(args).toEqual(['--check', '--ignore-path', '.gitignore', 'src'])
  })
})
