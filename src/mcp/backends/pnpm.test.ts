import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runTests } from './pnpm.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(opts: { stdout?: string; stderr?: string; exitCode?: number } = {}): unknown {
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
      if (event === 'close') queueMicrotask(() => fn(opts.exitCode ?? 0))
    },
  }
}

const originalProjectDir = process.env.CLAUDE_PROJECT_DIR
let defaultRoot: string | undefined

beforeEach(() => {
  defaultRoot = mkdtempSync(join(tmpdir(), 'ak-pnpm-default-'))
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

describe('pnpm backend', () => {
  it('runs `vp run --filter <p> test` once per package', async () => {
    spawnMock
      .mockReturnValueOnce(fakeChild({ stdout: 'a ok\n', exitCode: 0 }))
      .mockReturnValueOnce(fakeChild({ stdout: 'b ok\n', exitCode: 0 }))
    const result = await runTests({ packages: ['a', 'b'] })
    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(spawnMock.mock.calls[0]![0]).toBe('vp')
    expect(spawnMock.mock.calls[0]![1]).toEqual(['run', '--filter', 'a', 'test'])
    expect(spawnMock.mock.calls[1]![1]).toEqual(['run', '--filter', 'b', 'test'])
    expect(result.passed).toBe(true)
    expect(result.exitCode).toBe(0)
  })

  it('runs vitest directly for package targets that declare vitest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-pnpm-vitest-'))
    try {
      process.env.CLAUDE_PROJECT_DIR = root
      mkdirSync(join(root, 'packages', 'a'), { recursive: true })
      writeFileSync(
        join(root, 'packages', 'a', 'package.json'),
        JSON.stringify({ devDependencies: { vitest: '^4.0.0' } }),
      )
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: '{}\n', exitCode: 0 }))

      await runTests({ packages: ['a'] })

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        'exec',
        '--filter',
        'a',
        '--',
        'vitest',
        'run',
        '--reporter=json',
        '--no-color',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves file filters when package targets declare vitest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-pnpm-vitest-files-'))
    try {
      process.env.CLAUDE_PROJECT_DIR = root
      mkdirSync(join(root, 'packages', 'a'), { recursive: true })
      writeFileSync(
        join(root, 'packages', 'a', 'package.json'),
        JSON.stringify({ devDependencies: { vitest: '^4.0.0' } }),
      )
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: '{}\n', exitCode: 0 }))

      await runTests({ packages: ['a'], files: ['src/a.test.ts'] })

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        'exec',
        '--filter',
        'a',
        '--',
        'vitest',
        'run',
        '--reporter=json',
        '--no-color',
        'src/a.test.ts',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves file filters for non-vitest package test scripts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ak-pnpm-script-files-'))
    try {
      process.env.CLAUDE_PROJECT_DIR = root
      mkdirSync(join(root, 'packages', 'a'), { recursive: true })
      writeFileSync(
        join(root, 'packages', 'a', 'package.json'),
        JSON.stringify({ scripts: { test: 'node test-runner.js' } }),
      )
      spawnMock.mockReturnValueOnce(fakeChild({ stdout: 'ok\n', exitCode: 0 }))

      await runTests({ packages: ['a'], files: ['src/a.test.ts'] })

      expect(spawnMock.mock.calls[0]![1]).toEqual([
        'run',
        '--filter',
        'a',
        'test',
        '--',
        'src/a.test.ts',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('aggregates failure when one package fails', async () => {
    spawnMock
      .mockReturnValueOnce(fakeChild({ exitCode: 0 }))
      .mockReturnValueOnce(fakeChild({ stderr: 'oops', exitCode: 1 }))
    const result = await runTests({ packages: ['a', 'b'] })
    expect(result.passed).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('oops')
  })

  it('runs bare `vp run test` when no packages or files given', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
    await runTests({})
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['run', 'test'])
  })

  it('runs `vp run test -- <files>` when files are given without packages', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
    await runTests({ files: ['a.test.ts', 'b.test.ts'] })
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['run', 'test', '--', 'a.test.ts', 'b.test.ts'])
  })
})
