import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('#cli/commands/init/scaffolders/context-mode/index.js', () => ({
  ensureContextMode: () => ({
    installed: true,
    codexMcp: { targetPath: '.codex-home/config.toml', action: 'identical' },
    codexHooks: { targetPath: '.codex-home/hooks.json', action: 'identical' },
    opencodeConfig: { targetPath: 'opencode.json', action: 'identical' },
  }),
}))

vi.mock('#cli/commands/init/scaffolders/codex-mcp/index.js', () => ({
  ensureCodexPlaywrightMcp: () => ({
    kind: 'codex-playwright-mcp-unchanged',
    path: '.codex-home/config.toml',
  }),
  ensureCodexAgentKitMcp: () => ({
    kind: 'codex-agent-kit-mcp-not-installed',
    path: '.codex-home/config.toml',
    checked: [],
  }),
}))

vi.mock('#cli/commands/init/scaffolders/vision/index.js', () => ({
  scaffoldVision: () => ({
    targetPath: 'VISION.md',
    action: 'identical',
  }),
}))

vi.mock('#cli/commands/init/scaffolders/runtime-check/index.js', () => ({
  checkRuntimes: () => [
    { name: 'bun', version: '1.3.13', hint: '' },
    { name: 'vp', version: 'vp v0.1.24', hint: '' },
  ],
}))

import { auditCatalogDrift } from '#audit/repo-guardrails'
import { resolveCatalogDir, runInit } from '#cli/commands/init/index'
import { ensureRtk } from '#cli/commands/init/scaffolders/rtk/index'
import { runHooksDoctor } from '#hooks/doctor'
import { routeCommand } from '#hooks/pretool-guard/dev-routing'

const agentKitRoot = dirname(resolveCatalogDir())
const fixtureRoot = join(agentKitRoot, '__fixtures__')
const fakeHomeSource = join(fixtureRoot, 'fake-home')
const fakeRtkBin = join(fixtureRoot, 'fake-tools', 'rtk-ok-bin')
const fakeOmxBin = join(fixtureRoot, 'fake-tools', 'omx-ok-bin')
const hookFixture = join(fixtureRoot, 'rtk-three-hook-composition')

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-rtk-integration-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: '@acme/rtk-fixture', private: true }),
  )
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
  let previousSkipGstack: string | undefined

  beforeEach(() => {
    repo = makeRepo()
    fakeHome = makeFakeHome()
    previousHome = process.env.HOME
    previousPath = process.env.PATH
    previousCodeHome = process.env.CODEX_HOME
    previousSkipGstack = process.env.AK_SKIP_GSTACK
    process.env.HOME = fakeHome
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.PATH = [fakeRtkBin, fakeOmxBin, previousPath ?? ''].filter(Boolean).join(':')
    // This fixture verifies RTK hook composition, not gstack installation.
    // Skip gstack so the test stays scoped and does not burn its timeout budget
    // on unrelated default preset work.
    process.env.AK_SKIP_GSTACK = '1'
    chmodSync(join(fakeRtkBin, 'rtk'), 0o755)
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    if (previousCodeHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodeHome
    if (previousSkipGstack === undefined) delete process.env.AK_SKIP_GSTACK
    else process.env.AK_SKIP_GSTACK = previousSkipGstack
    rmSync(repo, { recursive: true, force: true })
    rmSync(fakeHome, { recursive: true, force: true })
  })

  it('covers G1-G8 against a fixture repo aligned to current upstream RTK behavior', async () => {
    const first = await runInit({ cwd: repo, yes: true, with: 'rtk', host: 'codex' })
    expect(first).toBe(0) // G1

    const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }
    }
    const preToolCommands = settings.hooks.PreToolUse.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(preToolCommands.some((command) => command.includes('ak-pretool-guard'))).toBe(true)
    expect(
      preToolCommands.some((command) =>
        command.includes('oh-my-codex/dist/scripts/codex-native-hook.js'),
      ),
    ).toBe(true)
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

    const doctorOk = await runHooksDoctor({ skipMcp: true, cwd: repo })
    expect(doctorOk.checks.find((check) => check.name === 'rtk on PATH')?.ok).toBe(true) // G5

    // G6: catalog drift — import directly instead of bun cold-start subprocess
    // (bun --eval spawns a 5-11s cold-start that causes flaky parallel failures)
    expect(auditCatalogDrift(agentKitRoot).ok).toStrictEqual(true) // G6

    const second = ensureRtk({
      repoRoot: repo,
      options: { overwrite: false, dryRun: false },
    })
    expect(second.kind).toBe('rtk-ok')
    const settingsAfterSecond = readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')
    expect(settingsAfterSecond.match(/rtk-rewrite\.sh/g)?.length).toBe(1) // G7

    expect(settingsAfterSecond).toContain('RTK_TELEMETRY_DISABLED=1') // G8
    expect(settingsAfterSecond).not.toContain('.codex/hooks.json')
    expect(readFileSync(join(repo, '.codex', 'hooks.json'), 'utf8')).not.toContain('rtk')
  })
})
