import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { auditCatalogDrift } from '#audit/repo-guardrails'
import { resolveCatalogDir } from '#cli/commands/init/index'
import { scaffoldAgentHooks } from '#cli/commands/init/scaffolders/agent-hooks'
import { ensureRtk } from '#cli/commands/init/scaffolders/rtk'
import { checkRtkOnPath } from '#hooks/doctor'
import { routeCommand } from '#hooks/pretool-guard/dev-routing'

const agentKitRoot = dirname(resolveCatalogDir())
const fixtureRoot = join(agentKitRoot, '__fixtures__')
const fakeHomeSource = join(fixtureRoot, 'fake-home')
const fakeRtkBin = join(fixtureRoot, 'fake-tools', 'rtk-ok-bin')
const hookFixture = join(fixtureRoot, 'rtk-three-hook-composition')

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wp-rtk-integration-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: '@acme/rtk-fixture', private: true }),
  )
  cpSync(hookFixture, dir, { recursive: true })
  return dir
}

function makeFakeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wp-rtk-home-'))
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
  let previousCi: string | undefined
  let previousAkSkipGstack: string | undefined
  let previousAkSkipClaudePlugin: string | undefined
  let previousAkSkipOmc: string | undefined
  let previousWpSkipCodexTrustSync: string | undefined
  let previousWpSkipUpdateCheck: string | undefined
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleLogSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    repo = makeRepo()
    fakeHome = makeFakeHome()
    previousHome = process.env.HOME
    previousPath = process.env.PATH
    previousCodeHome = process.env.CODEX_HOME
    previousCi = process.env.CI
    previousAkSkipGstack = process.env.WP_SKIP_GSTACK
    previousAkSkipClaudePlugin = process.env.WP_SKIP_CLAUDE_PLUGIN
    previousAkSkipOmc = process.env.WP_SKIP_OMC
    previousWpSkipCodexTrustSync = process.env.WP_SKIP_CODEX_TRUST_SYNC
    previousWpSkipUpdateCheck = process.env.WP_SKIP_UPDATE_CHECK
    process.env.HOME = fakeHome
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.PATH = [fakeRtkBin, previousPath ?? ''].filter(Boolean).join(':')
    delete process.env.CI
    process.env.WP_SKIP_GSTACK = '1'
    process.env.WP_SKIP_CLAUDE_PLUGIN = '1'
    process.env.WP_SKIP_OMC = '1'
    process.env.WP_SKIP_CODEX_TRUST_SYNC = '1'
    process.env.WP_SKIP_UPDATE_CHECK = '1'
    chmodSync(join(fakeRtkBin, 'rtk'), 0o755)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    if (previousCodeHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodeHome
    if (previousCi === undefined) delete process.env.CI
    else process.env.CI = previousCi
    if (previousAkSkipGstack === undefined) delete process.env.WP_SKIP_GSTACK
    else process.env.WP_SKIP_GSTACK = previousAkSkipGstack
    if (previousAkSkipClaudePlugin === undefined) delete process.env.WP_SKIP_CLAUDE_PLUGIN
    else process.env.WP_SKIP_CLAUDE_PLUGIN = previousAkSkipClaudePlugin
    if (previousAkSkipOmc === undefined) delete process.env.WP_SKIP_OMC
    else process.env.WP_SKIP_OMC = previousAkSkipOmc
    if (previousWpSkipCodexTrustSync === undefined) delete process.env.WP_SKIP_CODEX_TRUST_SYNC
    else process.env.WP_SKIP_CODEX_TRUST_SYNC = previousWpSkipCodexTrustSync
    if (previousWpSkipUpdateCheck === undefined) delete process.env.WP_SKIP_UPDATE_CHECK
    else process.env.WP_SKIP_UPDATE_CHECK = previousWpSkipUpdateCheck
    consoleLogSpy?.mockRestore()
    consoleWarnSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
    rmSync(repo, { recursive: true, force: true })
    rmSync(fakeHome, { recursive: true, force: true })
  })

  it('covers G1-G8 against a fixture repo aligned to current upstream RTK behavior', async () => {
    mkdirSync(join(repo, '.agent'), { recursive: true })
    writeFileSync(join(repo, '.agent', '.rtk-requested'), 'managed by test\n')
    await scaffoldAgentHooks({
      repoRoot: repo,
      options: { overwrite: false, dryRun: false },
      trustCodexHooks: false,
    })

    const first = ensureRtk({
      repoRoot: repo,
      options: { overwrite: false, dryRun: false },
    })
    expect(first).toEqual({ kind: 'rtk-ok', installed: false }) // G1

    const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }
    }
    const preToolCommands = settings.hooks.PreToolUse.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(preToolCommands.some((command) => command.includes('wp-pretool-guard'))).toBe(true)
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
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'vp exec vitest' } }),
      repo,
    )
    expect(rtkPassthrough.stdout.trim()).toBe('{}')

    const agentKitRoute = routeCommand('vp exec vitest', `rtk-fixture-${Date.now()}`)
    expect(agentKitRoute?.action.action).toBe('deny')
    if (agentKitRoute?.action.action === 'deny') expect(agentKitRoute.action.tool).toBe('wp_test') // G4

    const doctorOk = await checkRtkOnPath(repo)
    expect(doctorOk?.ok).toBe(true) // G5

    // Mask rtk by clearing PATH — avoids leaking a host-installed rtk.
    process.env.PATH = ''
    const doctorMissing = await checkRtkOnPath(repo)
    expect(doctorMissing?.detail).toContain('brew install rtk')
    process.env.PATH = [fakeRtkBin, previousPath ?? ''].filter(Boolean).join(':')

    // G6: catalog drift — import directly instead of bun cold-start subprocess
    // (bun --eval spawns a 5-11s cold-start that causes flaky parallel failures)
    expect(auditCatalogDrift(agentKitRoot).ok).toStrictEqual(true) // G6

    // G7: re-running RTK's owner path must not duplicate the injected hook.
    const second = ensureRtk({
      repoRoot: repo,
      options: { overwrite: false, dryRun: false },
    })
    expect(second).toEqual({ kind: 'rtk-ok', installed: false })
    const settingsAfterSecond = readFileSync(join(repo, '.claude', 'settings.json'), 'utf8')
    expect(settingsAfterSecond.match(/rtk-rewrite\.sh/g)?.length).toBe(1) // G7

    expect(settingsAfterSecond).toContain('RTK_TELEMETRY_DISABLED=1') // G8
    expect(settingsAfterSecond).not.toContain('.codex/hooks.json')
    // G8 (codex isolation): rtk hook content must not leak into .codex/hooks.json.
    // Assert on real rtk markers — not the substring 'rtk', which now appears in
    // the tmpdir path baked into absolute bin paths after the codex hook trust
    // change (commit 8a31e2a switched CODEX_BIN to absolute paths for trust
    // verification).
    const codexHooksContent = readFileSync(join(repo, '.codex', 'hooks.json'), 'utf8')
    expect(codexHooksContent).not.toContain('rtk-rewrite.sh')
    expect(codexHooksContent).not.toContain('RTK_TELEMETRY_DISABLED')
    expect(codexHooksContent).not.toContain('RTK_HOOK_EXCLUDE_COMMANDS')
  })
})
