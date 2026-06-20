import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { installManagedRunnerHermeticHooks } from '#test-helpers/managed-runner'

import { buildQaCommand, QA_COMMAND_HELP, registerQaCommand, runQaCommand } from './qa.js'

function buildFakeCli() {
  let registeredAction: ((flags: Record<string, unknown>) => Promise<number>) | undefined
  const options: string[] = []
  const chain = {
    option: (name: string) => {
      options.push(name)
      return chain
    },
    action: (fn: typeof registeredAction) => {
      registeredAction = fn
      return chain
    },
  }
  return {
    command: () => chain,
    getOptions: () => options,
    getAction: () => registeredAction,
  }
}

describe('wp qa command', () => {
  const tempDirs: string[] = []

  installManagedRunnerHermeticHooks()

function bundledVpArgs(...tail: string[]) {
  return [process.execPath, expect.stringMatching(/vite-plus.*bin.*vp/), ...tail]
}

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
      args: bundledVpArgs('run', 'qa'),
    })
  })

  it('refuses recursive qa scripts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-qa-recursive-'))
    tempDirs.push(cwd)
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { qa: 'wp qa' } }), 'utf8')

    expect(buildQaCommand({ cwd })).toBeUndefined()
  })

  it('exposes the summary-first --full escape hatch', () => {
    const cli = buildFakeCli()
    registerQaCommand(cli as never)
    expect(cli.getOptions()).toContain('--full')
  })

  it('prints an actionable error for recursive qa scripts', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wp-qa-recursive-error-'))
    tempDirs.push(cwd)
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { qa: 'wp qa' } }), 'utf8')
    execFileSync('git', ['init'], { cwd, stdio: 'ignore' })

    const stderr = { write: vi.fn() }

    const result = await runQaCommand({ cwd }, { stderr })
    expect(result.exitCode).toBe(1)
    expect(stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('Refusing to run a recursive qa script.'),
    )
  })
})
