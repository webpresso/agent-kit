import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  it('formats markdown file targets without invoking oxfmt', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-format-md-'))
    const file = join(cwd, 'guide.md')
    writeFileSync(file, '# Guide\n\n* one\n* two\n')

    const result = await runFormat({ cwd, files: ['guide.md'] })

    expect(result).toMatchObject({
      passed: true,
      exitCode: 0,
    })
    expect(result.output).toContain('guide.md markdown formatted')
    expect(spawnMock).not.toHaveBeenCalled()
    expect(readFileSync(file, 'utf8')).toContain('- one')
  })

  it('fails check mode when markdown targets need formatting', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-format-md-check-'))
    const file = join(cwd, 'guide.md')
    const original = '# Guide\n\n* one\n'
    writeFileSync(file, original)

    const result = await runFormat({ cwd, files: ['guide.md'], check: true })

    expect(result).toMatchObject({
      passed: false,
      exitCode: 1,
    })
    expect(result.output).toContain('guide.md needs markdown formatting')
    expect(readFileSync(file, 'utf8')).toBe(original)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('routes only non-markdown targets through oxfmt when mixed files are provided', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-format-mixed-'))
    writeFileSync(join(cwd, 'README.md'), '# Readme\n\n* one\n')
    writeFileSync(join(cwd, 'sample.ts'), 'export const x=1\n')
    spawnMock.mockReturnValue(fakeChild({ stdout: 'sample.ts\n', exitCode: 0 }))

    const result = await runFormat({ cwd, files: ['README.md', 'sample.ts'] })

    expect(result).toMatchObject({
      passed: true,
      exitCode: 0,
    })
    const [cmd, args] = spawnMock.mock.calls[0]!
    expect(cmd).toContain('oxfmt')
    expect(args).toEqual(['--write', '--ignore-path', '.gitignore', 'sample.ts'])
    expect(result.output).toContain('README.md markdown formatted')
    expect(result.output).toContain('sample.ts')
  })
})
