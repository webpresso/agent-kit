import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const originalProjectDir = process.env.CLAUDE_PROJECT_DIR
let defaultRoot: string | undefined

beforeEach(() => {
  defaultRoot = mkdtempSync(join(tmpdir(), 'ak-just-default-'))
  process.env.CLAUDE_PROJECT_DIR = defaultRoot
})

afterEach(() => {
  spawnMock.mockReset()
  if (defaultRoot) rmSync(defaultRoot, { recursive: true, force: true })
  if (originalProjectDir === undefined) {
    delete process.env.CLAUDE_PROJECT_DIR
  } else {
    process.env.CLAUDE_PROJECT_DIR = originalProjectDir
  }
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

  it('passes extra args after `--` for recipes that forward args', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
    await runTests({ extraArgs: ['--reporter=json', '--no-color'] })
    const [, args] = spawnMock.mock.calls[0]!
    expect(args).toEqual(['test', '--', '--reporter=json', '--no-color'])
  })

  it('forwards vitest reporter args for vitest package targets', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-just-vitest-'))
    try {
      process.env.CLAUDE_PROJECT_DIR = root
      mkdirSync(join(root, 'packages', 'cli'), { recursive: true })
      writeFileSync(
        join(root, 'packages', 'cli', 'package.json'),
        JSON.stringify({ devDependencies: { vitest: '^4.0.0' } }),
      )
      spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))

      await runTests({ packages: ['cli'] })

      const [, args] = spawnMock.mock.calls[0]!
      expect(args).toEqual([
        'test',
        '--package',
        'cli',
        '--',
        '--reporter=json',
        '--no-color',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
