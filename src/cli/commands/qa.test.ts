import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'

import { buildQaCommand, QA_COMMAND_HELP, runQaCommand } from './qa.js'

describe('wp qa command', () => {
  const tempDirs: string[] = []

  installManagedRunnerHermeticHooks()

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('documents the qa entrypoint', () => {
    expect(QA_COMMAND_HELP).toContain('wp qa')
    expect(QA_COMMAND_HELP).toContain('--print-command')
  })

  it('runs the managed qa package script through vp', () => {
    expect(buildQaCommand()).toEqual({
      command: 'rtk',
      args: ['vp', 'run', 'qa'],
    })
  })

  it('refuses recursive qa scripts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-qa-recursive-'))
    tempDirs.push(cwd)
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { qa: 'wp qa' } }), 'utf8')

    expect(buildQaCommand({ cwd })).toBeUndefined()
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

    expect(runQaCommand({}, { run })).toBe(2)
    expect(run).toHaveBeenCalledWith('rtk', ['vp', 'run', 'qa'])
  })

  it('prints an actionable error for recursive qa scripts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-qa-recursive-error-'))
    tempDirs.push(cwd)
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { qa: 'wp qa' } }), 'utf8')

    const stderr = { write: vi.fn() }

    expect(runQaCommand({ cwd }, { stderr })).toBe(1)
    expect(stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Refusing to run a recursive qa script.'),
    )
  })
})
