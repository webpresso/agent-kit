import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveCatalogDir, runInit } from '#cli/commands/init/index'
import { runHooksDoctor } from '#hooks/doctor'
import { routeCommand } from '#hooks/pretool-guard/dev-routing'

const agentKitRoot = dirname(resolveCatalogDir())
const fixtureRoot = join(agentKitRoot, '__fixtures__')
const fakeHomeSource = join(fixtureRoot, 'fake-home')
const fakeRtkBin = join(fixtureRoot, 'fake-tools', 'rtk-ok-bin')
const fakeOmxBin = join(fixtureRoot, 'fake-tools', 'omx-ok-bin')
const hookFixture = join(fixtureRoot, 'rtk-three-hook-composition')
const sourceCli = join(agentKitRoot, 'src', 'cli', 'cli.ts')
const tsxCli = join(agentKitRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-rtk-integration-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@acme/rtk-fixture', private: true }))
  cpSync(hookFixture, dir, { recursive: true })
  return dir
}

function makeFakeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-rtk-home-'))
  cpSync(fakeHomeSource, dir, { recursive: true })
  return dir
}

function runHook(file: string, payload: string, cwd: string): { status: number; stdout: string } {
  const result = spawnSync(file, [], {
    cwd,
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
  })
  return { status: result.status ?? -1, stdout: result.stdout ?? '' }
}

describe('rtk scaffolder integration', () => {
  let repo: string
  let fakeHome: string
  let previousHome: string | undefined
  let previousPath: string | undefined
  let previousCodeHome: string | undefined
  let previousCwd = process.cwd()

  beforeEach(() => {
    repo = makeRepo()
    fakeHome = makeFakeHome()
    previousHome = process.env.HOME
    previousPath = process.env.PATH
    previousCodeHome = process.env.CODEX_HOME
    previousCwd = process.cwd()
    process.env.HOME = fakeHome
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.PATH = [fakeRtkBin, fakeOmxBin, previousPath ?? ''].filter(Boolean).join(':')
    chmodSync(join(fakeRtkBin, 'rtk'), 0o755)
    process.chdir(repo)
  })

  afterEach(() => {
    if (previousCwd) process.chdir(previousCwd)
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    if (previousCodeHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodeHome
    rmSync(repo, { recursive: true, force: true })
    rmSync(fakeHome, { recursive: true, force: true })
  })

  it('covers G1-G8 against a fixture repo aligned to current upstream RTK behavior', async () => {
    const first = await runInit({ cwd: repo, yes: true, with: 'rtk' })
    expect(first).toBe(0) // G1

    const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }
    }
    const preToolCommands = settings.hooks.PreToolUse.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(preToolCommands.some((command) => command.includes('ak-pretool-guard'))).toBe(true)
    expect(preToolCommands.some((command) => command.includes('oh-my-codex/dist/scripts/codex-native-hook.js'))).toBe(true)
    expect(preToolCommands.some((command) => command.includes('rtk-rewrite.sh'))).toBe(true) // G2

    const rtkHook = runHook(
      join(repo, '.claude', 'hooks', 'rtk-rewrite.sh'),
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
      repo,
    )
    expect(rtkHook.status).toBe(0)
    expect(rtkHook.stdout).toContain('rtk git status') // G3

    const rtkPassthrough = runHook(
      join(repo, '.claude', 'hooks', 'rtk-rewrite.sh'),
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm test' } }),
      repo,
    )
    expect(rtkPassthrough.stdout.trim()).toBe('{}')

    const agentKitRoute = routeCommand('pnpm test', `rtk-fixture-${Date.now()}`)
    expect(agentKitRoute?.action.action).toBe('deny')
    if (agentKitRoute?.action.action === 'deny') expect(agentKitRoute.action.tool).toBe('ak_test') // G4

    const doctorOk = await runHooksDoctor({ skipMcp: true })
    expect(doctorOk.checks.find((check) => check.name === 'rtk on PATH')?.ok).toBe(true) // G5

    process.env.PATH = [fakeOmxBin, previousPath ?? ''].filter(Boolean).join(':')
    const doctorMissing = await runHooksDoctor({ skipMcp: true })
    expect(doctorMissing.checks.find((check) => check.name === 'rtk on PATH')?.detail).toContain('brew install rtk')
    process.env.PATH = [fakeRtkBin, fakeOmxBin, previousPath ?? ''].filter(Boolean).join(':')

    const drift = spawnSync(process.execPath, [tsxCli, sourceCli, 'audit', 'catalog-drift'], {
      cwd: agentKitRoot,
      encoding: 'utf8',
      env: process.env,
    })
    expect(drift.status).toBe(0) // G6

    const second = await runInit({ cwd: repo, yes: true, with: 'rtk' })
    expect(second).toBe(0)
    const settingsAfterSecond = readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')
    expect(settingsAfterSecond.match(/rtk-rewrite\.sh/g)?.length).toBe(1) // G7

    expect(settingsAfterSecond).toContain('RTK_TELEMETRY_DISABLED=1') // G8
    expect(settingsAfterSecond).not.toContain('.codex/hooks.json')
    expect(readFileSync(join(repo, '.codex', 'hooks.json'), 'utf8')).not.toContain('rtk')
  })
})
