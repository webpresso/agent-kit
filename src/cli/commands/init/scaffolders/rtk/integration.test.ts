import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditCatalogDrift } from '#audit/repo-guardrails'
import { resolveCatalogDir, runInit } from '#cli/commands/init/index'
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
  let previousCi: string | undefined
  let previousAkSkipGstack: string | undefined
  let previousAkSkipClaudePlugin: string | undefined

  beforeEach(() => {
    repo = makeRepo()
    fakeHome = makeFakeHome()
    previousHome = process.env.HOME
    previousPath = process.env.PATH
    previousCodeHome = process.env.CODEX_HOME
    previousCi = process.env.CI
    previousAkSkipGstack = process.env.AK_SKIP_GSTACK
    previousAkSkipClaudePlugin = process.env.AK_SKIP_CLAUDE_PLUGIN
    process.env.HOME = fakeHome
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.PATH = [fakeRtkBin, fakeOmxBin, previousPath ?? ''].filter(Boolean).join(':')
    // runInit() short-circuits the rtk scaffolder when CI=true/1 (production
    // guard against postinstall failures on hosted CI runners). This test
    // intentionally exercises the rtk preset against a PATH-injected fake
    // rtk binary, so we must run outside the CI-skip branch — otherwise
    // settings.json is never scaffolded with rtk-rewrite.sh and every G2-G8
    // assertion fails.
    delete process.env.CI
    // The default preset list (src/cli/commands/init/index.ts:79) is
    // ['omx', 'gstack', 'vision', 'rtk'] — every runInit() call runs all
    // four regardless of --with. Two of those involve real, heavy work
    // this test does not cover:
    //
    // - gstack: `git clone https://github.com/garrytan/gstack` — a real
    //   network call that adds ~15-20s and makes the test depend on GitHub.
    // - claude plugin: spawns the real `claude` CLI three times
    //   (`plugin marketplace add` → `plugin install` → `plugin update`),
    //   each a 5+s subprocess. ~17s total measured locally with a
    //   claude binary on PATH.
    //
    // Both have production-supported opt-out env vars used precisely for
    // this case:
    //   - AK_SKIP_GSTACK → src/cli/commands/init/index.ts:509-512
    //   - AK_SKIP_CLAUDE_PLUGIN → src/cli/commands/init/scaffolders/
    //     claude-plugin/index.ts:58-60
    //
    // Skipping them scopes the test to what it actually covers (the rtk
    // scaffolder) and brings the test cost under the 20s budget without
    // bumping the timeout (per the no-timeout-as-fix rule).
    process.env.AK_SKIP_GSTACK = '1'
    process.env.AK_SKIP_CLAUDE_PLUGIN = '1'
    chmodSync(join(fakeRtkBin, 'rtk'), 0o755)
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
    if (previousAkSkipGstack === undefined) delete process.env.AK_SKIP_GSTACK
    else process.env.AK_SKIP_GSTACK = previousAkSkipGstack
    if (previousAkSkipClaudePlugin === undefined) delete process.env.AK_SKIP_CLAUDE_PLUGIN
    else process.env.AK_SKIP_CLAUDE_PLUGIN = previousAkSkipClaudePlugin
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

    // Mask rtk by isolating PATH to fakeOmxBin only — including previousPath
    // would leak `/opt/homebrew/bin/rtk` on machines where rtk is installed.
    process.env.PATH = fakeOmxBin
    const doctorMissing = await runHooksDoctor({ skipMcp: true, cwd: repo })
    expect(doctorMissing.checks.find((check) => check.name === 'rtk on PATH')?.detail).toContain(
      'brew install rtk',
    )
    process.env.PATH = [fakeRtkBin, fakeOmxBin, previousPath ?? ''].filter(Boolean).join(':')

    // G6: catalog drift — import directly instead of bun cold-start subprocess
    // (bun --eval spawns a 5-11s cold-start that causes flaky parallel failures)
    expect(auditCatalogDrift(agentKitRoot).ok).toStrictEqual(true) // G6

    const second = await runInit({ cwd: repo, yes: true, with: 'rtk' })
    expect(second).toBe(0)
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
  }, 20_000)
})
