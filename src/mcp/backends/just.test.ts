import { afterEach, describe, expect, it, vi } from 'vitest'

import { runTests } from './just.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(opts: {
  stdout?: string
  stderr?: string
  exitCode?: number
} = {}): unknown {
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
    on: (event: string, fn: (code: number) => void) => {
      if (event === 'close') {
        // schedule async to mirror real spawn
        queueMicrotask(() => fn(opts.exitCode ?? 0))
      }
    },
  }
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('just backend', () => {
  it('runs `just test --package <p1> <p2>` for package targets', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: 'ok\n', exitCode: 0 }))
    const result = await runTests({ packages: ['cli', 'core'] })
    expect(spawnMock).toHaveBeenCalledOnce()
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('just')
    expect(args).toEqual(['test', '--package', 'cli', 'core'])
    expect(result.passed).toBe(true)
    expect(result.exitCode).toBe(0)
  })

  it('runs `just test --file <f1> <f2>` for file targets', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: 'ok\n', exitCode: 0 }))
    await runTests({ files: ['a.test.ts', 'b.test.ts'] })
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('just')
    expect(args).toEqual(['test', '--file', 'a.test.ts', 'b.test.ts'])
  })

  it('reports failure with non-zero exit code', async () => {
    spawnMock.mockReturnValue(fakeChild({ stderr: 'boom', exitCode: 1 }))
    const result = await runTests({ packages: ['x'] })
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('boom')
  })

  it('falls back to bare `just test` when no targets given', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
    await runTests({})
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('just')
    expect(args).toEqual(['test'])
  })
})
