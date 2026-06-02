import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runTests } from './test.js'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

function fakeChild(
  opts: {
    stdout?: string
    stderr?: string
    exitCode?: number
    hang?: boolean
    killCapture?: { signal: NodeJS.Signals | null }
  } = {},
): unknown {
  let closeFn: ((code: number | null, signal?: NodeJS.Signals | null) => void) | null = null
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
    on: (event: string, fn: (code: number | null, signal?: NodeJS.Signals | null) => void) => {
      if (event === 'close') {
        closeFn = fn
        if (!opts.hang) queueMicrotask(() => fn(opts.exitCode ?? 0))
      }
    },
    kill: (signal: NodeJS.Signals) => {
      if (opts.killCapture) opts.killCapture.signal = signal
      if (closeFn) queueMicrotask(() => closeFn?.(null, signal))
    },
  }
}

function writeVitestWorkspace(root: string): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^4.0.0' },
    }),
  )
}

function writeTestFiles(root: string, count: number): string[] {
  const files: string[] = []
  mkdirSync(join(root, 'src'), { recursive: true })
  for (let index = 1; index <= count; index += 1) {
    const relative = `src/spec-${index}.test.ts`
    writeFileSync(
      join(root, relative),
      `import { it, expect } from 'vitest'\nit('spec-${index}', () => expect(1).toBe(1))\n`,
    )
    files.push(relative)
  }
  return files
}

const originalProjectDir = process.env.CLAUDE_PROJECT_DIR
let defaultRoot: string | undefined

beforeEach(() => {
  defaultRoot = mkdtempSync(join(tmpdir(), 'wp-vp-default-'))
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

describe('test runner', () => {
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
    const root = mkdtempSync(join(tmpdir(), 'wp-vp-vitest-'))
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
    const root = mkdtempSync(join(tmpdir(), 'wp-vp-vitest-files-'))
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
    const root = mkdtempSync(join(tmpdir(), 'wp-vp-script-files-'))
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

  it('stops package iteration after a timed out package', async () => {
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
    spawnMock
      .mockReturnValueOnce(fakeChild({ hang: true, killCapture }))
      .mockReturnValueOnce(fakeChild({ stdout: 'should-not-run\n', exitCode: 0 }))

    const result = await runTests({
      packages: ['a', 'b'],
      timeoutMs: 1,
      workspaceSharding: { totalBudgetMs: 1_000 },
    })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(killCapture.signal).toBe('SIGTERM')
    expect(result.passed).toBe(false)
    expect(result.timedOut).toBe(true)
    expect(result.failureScope).toBe('package a')
  })

  it('runs bare `vp run test` when no packages or files given', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
    await runTests({})
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['run', 'test'])
  })

  it('records workspace command scope when bare workspace run times out', async () => {
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
    spawnMock.mockReturnValue(fakeChild({ hang: true, killCapture }))

    const result = await runTests({ timeoutMs: 1 })

    expect(killCapture.signal).toBe('SIGTERM')
    expect(result.timedOut).toBe(true)
    expect(result.failureScope).toBe('workspace command')
  })

  it('uses the repo test script for workspace runs even when the root declares vitest', async () => {
    writeVitestWorkspace(defaultRoot!)
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))

    await runTests({})

    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['run', 'test'])
  })

  it('bypasses a recursive workspace wp test script and runs vitest directly', async () => {
    writeFileSync(
      join(defaultRoot!, 'package.json'),
      JSON.stringify({
        scripts: { test: 'wp test' },
        devDependencies: { vitest: '^4.0.0' },
      }),
    )
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))

    await runTests({})

    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['exec', '--', 'vitest', 'run', '--reporter=json', '--no-color'])
  })

  it('shards root vitest workspace runs across discovered test files', async () => {
    writeVitestWorkspace(defaultRoot!)
    const files = writeTestFiles(defaultRoot!, 6)
    spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))

    await runTests({})

    expect(spawnMock).toHaveBeenCalledTimes(2)
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[])
    for (const args of shardCalls) {
      expect(args.slice(0, 6)).toEqual([
        'exec',
        '--',
        'vitest',
        'run',
        '--reporter=json',
        '--no-color',
      ])
    }

    const executedFiles = shardCalls.flatMap((args) => args.slice(6)).sort()
    expect(executedFiles).toEqual(files.sort())
  })

  it('shards explicit vitest file filters across multiple runs when the list is large', async () => {
    writeVitestWorkspace(defaultRoot!)
    const files = writeTestFiles(defaultRoot!, 6)
    spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))

    await runTests({ files })

    expect(spawnMock).toHaveBeenCalledTimes(2)
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[])
    for (const args of shardCalls) {
      expect(args.slice(0, 6)).toEqual([
        'exec',
        '--',
        'vitest',
        'run',
        '--reporter=json',
        '--no-color',
      ])
    }

    const executedFiles = shardCalls.flatMap((args) => args.slice(6)).sort()
    expect(executedFiles).toEqual(files.sort())
  })

  it('can disable workspace sharding explicitly for root vitest workspaces', async () => {
    writeVitestWorkspace(defaultRoot!)
    writeTestFiles(defaultRoot!, 6)
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))

    await runTests({ workspaceSharding: { enabled: false } })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['run', 'test'])
  })

  it('respects custom shard sizing controls for larger workspaces', async () => {
    writeVitestWorkspace(defaultRoot!)
    const files = writeTestFiles(defaultRoot!, 10)
    spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))

    await runTests({
      workspaceSharding: {
        minFilesToShard: 2,
        targetFilesPerShard: 2,
        maxShards: 3,
      },
    })

    expect(spawnMock).toHaveBeenCalledTimes(3)
    const shardCalls = spawnMock.mock.calls.map((call) => call[1] as string[])
    const executedFiles = shardCalls.flatMap((args) => args.slice(6)).sort()
    expect(executedFiles).toEqual(files.sort())
  })

  it('fails with timed out shard scope when a workspace vitest shard hangs', async () => {
    writeVitestWorkspace(defaultRoot!)
    writeTestFiles(defaultRoot!, 6)
    const killCapture: { signal: NodeJS.Signals | null } = { signal: null }
    spawnMock
      .mockReturnValueOnce(fakeChild({ hang: true, killCapture }))
      .mockReturnValueOnce(fakeChild({ stdout: 'should-not-run\n', exitCode: 0 }))

    const result = await runTests({ timeoutMs: 1 })

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(killCapture.signal).toBe('SIGTERM')
    expect(result.passed).toBe(false)
    expect(result.timedOut).toBe(true)
    expect(result.output).toContain('scope: shard 1/2')
  })

  it('fails meaningfully when the global test budget is exhausted before a shard starts', async () => {
    writeVitestWorkspace(defaultRoot!)
    writeTestFiles(defaultRoot!, 6)
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(1_000_000)
    nowSpy.mockReturnValueOnce(1_090_001)
    try {
      const result = await runTests({})

      expect(spawnMock).not.toHaveBeenCalled()
      expect(result.passed).toBe(false)
      expect(result.timedOut).toBe(true)
      expect(result.failureScope).toBe('overall test budget')
      expect(result.output).toContain('Global test budget exhausted before shard 1/2')
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('uses explicit timeoutMs as the default total budget for shard sequences', async () => {
    writeVitestWorkspace(defaultRoot!)
    writeTestFiles(defaultRoot!, 6)
    spawnMock.mockReturnValue(fakeChild({ stdout: '{}\n', exitCode: 0 }))
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(1_000_000)
    nowSpy.mockReturnValueOnce(1_000_000)
    nowSpy.mockReturnValueOnce(1_090_001)
    try {
      const result = await runTests({ timeoutMs: 120_000 })

      expect(spawnMock).toHaveBeenCalledTimes(2)
      expect(result.passed).toBe(true)
      expect(result.timedOut).toBe(false)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('respects custom total budget for package sequences', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(1_000_000)
    nowSpy.mockReturnValueOnce(1_000_000)
    nowSpy.mockReturnValueOnce(1_000_011)
    try {
      const result = await runTests({
        packages: ['a', 'b'],
        workspaceSharding: { totalBudgetMs: 10 },
      })

      expect(spawnMock).toHaveBeenCalledTimes(1)
      expect(result.passed).toBe(false)
      expect(result.timedOut).toBe(true)
      expect(result.failureScope).toBe('overall test budget')
      expect(result.output).toContain('Global test budget exhausted before package b')
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('runs `vp run test -- <files>` when files are given without packages', async () => {
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))
    await runTests({ files: ['a.test.ts', 'b.test.ts'] })
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual(['run', 'test', '--', 'a.test.ts', 'b.test.ts'])
  })

  it('runs vitest directly for file filters when the root declares vitest', async () => {
    writeFileSync(
      join(defaultRoot!, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^4.0.0' } }),
    )
    spawnMock.mockReturnValue(fakeChild({ exitCode: 0 }))

    await runTests({ files: ['a.test.ts', 'b.test.ts'] })

    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toBe('vp')
    expect(args).toEqual([
      'exec',
      '--',
      'vitest',
      'run',
      '--reporter=json',
      '--no-color',
      'a.test.ts',
      'b.test.ts',
    ])
  })
})
