import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveLocalPackageEntrypoint, resolveNodeRuntimeCommand } from '#tool-runtime/local-package-entrypoint.js'
import { buildTypecheckCommand, runTypecheckCommand } from './typecheck'

describe('wp typecheck command', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('builds the default no-emit command with stable non-pretty output', () => {
    const tscEntrypoint = resolveLocalPackageEntrypoint(process.cwd(), 'typescript', 'bin/tsc')
    expect(buildTypecheckCommand()).toEqual({
      command: resolveNodeRuntimeCommand(),
      args: [tscEntrypoint!, '--noEmit', '--pretty', 'false'],
    })
  })

  it('can preserve pretty output when requested', () => {
    const tscEntrypoint = resolveLocalPackageEntrypoint(process.cwd(), 'typescript', 'bin/tsc')
    expect(buildTypecheckCommand({ pretty: true })).toEqual({
      command: resolveNodeRuntimeCommand(),
      args: [tscEntrypoint!, '--noEmit'],
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
      command: 'vp',
      args: ['run', 'check-types'],
    })
  })

  it('bypasses a recursive check-types script and falls back to managed tsc', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-typecheck-recursive-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ scripts: { 'check-types': 'wp typecheck' } }),
      'utf8',
    )

    expect(buildTypecheckCommand({ cwd })).toEqual({
      command: 'vp',
      args: ['exec', 'tsc', '--noEmit', '--pretty', 'false'],
    })
  })

  it('returns the child process exit status for explicit check-types scripts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-typecheck-runner-'))
    tempDirs.push(cwd)
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ scripts: { 'check-types': 'tsgo --noEmit' } }),
      'utf8',
    )

    const run = vi.fn(() => ({
      status: 2,
      signal: null,
      output: [],
      pid: 1,
      stdout: '',
      stderr: '',
    }))
    return runTypecheckCommand({ cwd }, { run }).then((status) => {
      expect(status).toBe(2)
      expect(run).toHaveBeenCalledWith('vp', ['run', 'check-types'])
    })
  })

  it('uses the shared portable runner when the local typecheck script is recursive', async () => {
    const runPortableTypecheck = vi.fn().mockResolvedValue({
      passed: false,
      errorCount: 1,
      errors: [],
      output: 'TS1234 boom\n',
    })
    const stdout = { write: vi.fn() }

    await expect(
      runTypecheckCommand(
        { pretty: false },
        {
          runTypecheck: runPortableTypecheck,
          stdout,
        },
      ),
    ).resolves.toBe(1)
    expect(runPortableTypecheck).toHaveBeenCalledWith({
      cwd: process.cwd(),
      pretty: false,
    })
    expect(stdout.write).toHaveBeenCalledWith('TS1234 boom\n')
  })
})
