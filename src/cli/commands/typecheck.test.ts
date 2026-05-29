import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildTypecheckCommand, runTypecheckCommand } from './typecheck'

describe('wp typecheck command', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('builds the default no-emit command with stable non-pretty output', () => {
    expect(buildTypecheckCommand()).toEqual({
      command: 'rtk',
      args: ['tsc', '--noEmit', '--pretty', 'false'],
    })
  })

  it('can preserve pretty output when requested', () => {
    expect(buildTypecheckCommand({ pretty: true })).toEqual({
      command: 'rtk',
      args: ['tsc', '--noEmit'],
    })
  })

  it('uses the repo check-types script when package.json defines one', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-typecheck-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ scripts: { 'check-types': 'tsgo --noEmit' } }),
      'utf8',
    )

    expect(buildTypecheckCommand({ cwd })).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'check-types'],
    })
  })

  it('returns the child process exit status', () => {
    const run = vi.fn(() => ({
      status: 2,
      signal: null,
      output: [],
      pid: 1,
      stdout: '',
      stderr: '',
    }))
    expect(runTypecheckCommand({}, { run })).toBe(2)
    expect(run).toHaveBeenCalledWith('rtk', ['tsc', '--noEmit', '--pretty', 'false'])
  })
})
