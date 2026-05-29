import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getManagedRunner = vi.hoisted(() => vi.fn())
const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('#tool-runtime', () => ({
  getManagedRunner,
}))

getManagedRunner.mockReturnValue({
  command: 'oxfmt',
  args: [],
})

import { runFormat } from './index.js'

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

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

function enoent(): NodeJS.ErrnoException {
  const err = new Error('spawn oxfmt ENOENT') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

function makeFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wp-format-fixture-'))
  return dir
}

afterEach(() => {
  getManagedRunner.mockReset()
  getManagedRunner.mockReturnValue({
    command: 'oxfmt',
    args: [],
  })
  spawnMock.mockReset()
})

describe('runFormat', () => {
  it('returns passed=true when oxfmt exits 0 on already-formatted files', async () => {
    getManagedRunner.mockReturnValue({ command: 'oxfmt', args: [] })
    spawnMock.mockReturnValue(fakeChild({ stdout: 'Finished in 5ms\n', exitCode: 0 }))
    const dir = makeFixtureDir()
    writeFileSync(join(dir, 'a.ts'), "const x = 'hi'\n")

    const result = await runFormat({ cwd: dir, files: ['a.ts'] })

    expect(result.passed).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(getManagedRunner).toHaveBeenCalledWith('oxfmt', {
      fallbackCommand: 'oxfmt',
      fallbackArgs: [],
      filterOutput: false,
    })
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('oxfmt')
    expect(args).toEqual(['--write', '--ignore-path', '.gitignore', 'a.ts'])
  })

  it('passes --check and returns passed=false when oxfmt finds unformatted files', async () => {
    spawnMock.mockReturnValue(fakeChild({ stderr: 'a.ts is not formatted\n', exitCode: 1 }))
    const dir = makeFixtureDir()
    writeFileSync(join(dir, 'a.ts'), 'const x = "hi";\n')

    const result = await runFormat({ cwd: dir, files: ['a.ts'], check: true })

    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('not formatted')
    const [, args] = spawnMock.mock.calls[0]!
    expect(args).toEqual(['--check', '--ignore-path', '.gitignore', 'a.ts'])
  })

  it('without check, invokes --write and reports passed when oxfmt exits 0', async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: 'Finished\n', exitCode: 0 }))
    const dir = makeFixtureDir()
    const file = join(dir, 'b.ts')
    writeFileSync(file, 'const x = "hi";')

    const result = await runFormat({ cwd: dir, files: ['b.ts'] })

    expect(result.passed).toBe(true)
    expect(result.fixedFiles).toBeDefined()
    const [, args] = spawnMock.mock.calls[0]!
    expect(args[0]).toBe('--write')
    expect(args).toContain('--ignore-path')
    // Sanity: the file path the test created is real on disk so the test isn't
    // relying on side effects from the (mocked) spawn itself.
    expect(readFileSync(file, 'utf8')).toBe('const x = "hi";')
  })

  it('throws a clear error naming the missing binary when oxfmt is not on PATH', async () => {
    spawnMock.mockReturnValue(fakeChild({ error: enoent() }))
    const dir = makeFixtureDir()

    await expect(runFormat({ cwd: dir, files: ['a.ts'] })).rejects.toThrow(/oxfmt binary not found/)
    await expect(runFormat({ cwd: dir, files: ['a.ts'] })).rejects.toThrow(/vp install -D oxfmt/)
  })

  it('surfaces non-ENOENT spawn errors via spawnError without throwing', async () => {
    const eperm = new Error('spawn oxfmt EPERM') as NodeJS.ErrnoException
    eperm.code = 'EPERM'
    spawnMock.mockReturnValue(fakeChild({ error: eperm }))
    const dir = makeFixtureDir()

    const result = await runFormat({ cwd: dir, files: ['a.ts'] })
    expect(result.passed).toBe(false)
    expect(result.spawnError).toMatch(/EPERM/)
  })
})
