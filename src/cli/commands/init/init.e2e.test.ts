/**
 * End-to-end tests that spawn the actual `wp` CLI as a subprocess with
 * env manipulation (PATH / HOME) to simulate every preset code path
 * against fixtures instead of real omx/gstack/etc.
 *
 * These are slower than the unit + integration tests (subprocess fork
 * per case) but verify the full binary boundary: argv parsing, exit
 * codes, stdout/stderr, env handling. They use no mocks.
 *
 * Fixtures live under __fixtures__/{fake-tools,fake-home}.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..')
const DIST_CLI_PATH = path.join(REPO_ROOT, 'dist', 'esm', 'cli', 'cli.js')
const SOURCE_CLI_PATH = path.join(REPO_ROOT, 'src', 'cli', 'cli.ts')

// Resolve `bun` to an absolute path once. Tests below override PATH for
// isolation, which would hide a bare `bun` lookup. Spawn via the absolute
// path instead so PATH overrides never break the runner itself.
function resolveBunPath(): string {
  const fromEnv = process.env.BUN_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const probe = spawnSync('which', ['bun'], { encoding: 'utf8' })
  const trimmed = probe.stdout?.trim()
  if (trimmed && existsSync(trimmed)) return trimmed
  // Last-resort fallback (homebrew install path on macOS); existsSync below
  // still gates the suite, so a wrong guess just causes a clean skip.
  return '/opt/homebrew/bin/bun'
}
const BUN_PATH = resolveBunPath()
const FIXTURES = path.join(REPO_ROOT, '__fixtures__')
const OMX_OK_BIN = path.join(FIXTURES, 'fake-tools', 'omx-ok-bin')
const OMX_FAIL_BIN = path.join(FIXTURES, 'fake-tools', 'omx-fail-bin')
const FAKE_HOME = path.join(FIXTURES, 'fake-home')

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function runAk(args: string[], extraEnv: Record<string, string> = {}): RunResult {
  // Prefer running source via `bun` (matches every other repo-owned script);
  // fall back to the built dist CLI under `node` if the source isn't there.
  const useSource = existsSync(SOURCE_CLI_PATH)
  const command = useSource ? BUN_PATH : process.execPath
  const commandArgs = useSource ? [SOURCE_CLI_PATH, ...args] : [DIST_CLI_PATH, ...args]
  // Build a clean base env: inherit process.env but strip CI sentinels so
  // the subprocess behaves like a developer workstation. Without this,
  // GitHub Actions' CI=true causes isCiEnvironment to be true inside the
  // spawned wp binary, which skips omx/omc/gstack/rtk preset execution and
  // makes every preset e2e test assert on output that is never produced.
  // Individual tests can re-add CI=true via extraEnv if they need CI behaviour.
  const { CI: _ci, GITHUB_ACTIONS: _ga, ...baseEnv } = process.env
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    env: {
      ...baseEnv,
      // rtk and OMC are default-on but depend on workstation-global tools not
      // packaged in this fixture PATH — skip unless a test explicitly opts in.
      WP_SKIP_RTK: '1',
      WP_SKIP_OMC: '1',
      // The e2e runner invokes source through Bun while hook launchers must
      // hard-target Node. Keep the generated launcher contract independent of
      // the fixture PATH that intentionally hides node.
      WP_HOOK_NODE_PATH: process.execPath,
      ...extraEnv,
    },
  })
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-init-e2e-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  spawnSync('git', ['commit', '--allow-empty', '-q', '-m', 'bootstrap'], { cwd: dir })
  return dir
}

/**
 * Copy the fake-home fixture to a fresh tmp dir so tools that write
 * HOME-relative cache state (vite-plus, etc.) can't pollute the
 * source-tracked fixture across runs.
 */
function makeIsolatedFakeHome(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-fake-home-'))
  cpSync(FAKE_HOME, dir, { recursive: true })
  return dir
}

function writePluginCacheVersion(
  homeDir: string,
  rootParts: readonly string[],
  marketplace: string,
  version: string,
): string {
  const dir = path.join(homeDir, ...rootParts, marketplace, 'agent-kit', version)
  mkdirSync(path.join(dir, 'skills', 'fix'), { recursive: true })
  writeFileSync(
    path.join(dir, 'skills', 'fix', 'SKILL.md'),
    `---\nname: fix\nversion: ${version}\n---\n`,
  )
  return dir
}

/** A PATH that contains only the omx-ok fixture, no real omx. */
function pathWithFakeOmxOk(): string {
  return `${OMX_OK_BIN}:/usr/bin:/bin`
}

/** A PATH that contains the omx-fail fixture (probe ok, setup fails). */
function pathWithFakeOmxFail(): string {
  return `${OMX_FAIL_BIN}:/usr/bin:/bin`
}

/** A PATH with no omx anywhere. */
function pathWithoutOmx(): string {
  return '/usr/bin:/bin'
}

function makeRewritingOmxPath(repoRoot: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-fake-omx-rewrite-'))
  const omxPath = path.join(dir, 'omx')
  writeFileSync(
    omxPath,
    `#!/bin/sh
case "$1" in
  --version)
    echo "omx-fixture 1.0.0"
    exit 0
    ;;
  setup)
    mkdir -p "${repoRoot}/.codex"
    cat > "${repoRoot}/.codex/hooks.json" <<'JSON'
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "./node_modules/.bin/wp-sessionstart-routing" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "./node_modules/.bin/wp-stop-qa" }] }
    ]
  }
}
JSON
    echo "omx-fixture: setup --yes rewrote codex hooks"
    exit 0
    ;;
  *)
    echo "omx-fixture: unknown subcommand: $1" >&2
    exit 64
    ;;
esac
`,
    'utf8',
  )
  spawnSync('chmod', ['+x', omxPath])
  return `${dir}:/usr/bin:/bin`
}

describe.skipIf(!existsSync(DIST_CLI_PATH) && !existsSync(SOURCE_CLI_PATH))(
  'wp setup — live e2e via subprocess',
  { timeout: 60_000 },
  () => {
    let repo: string
    let fakeHome: string

    beforeEach(() => {
      repo = makeRepo()
      fakeHome = makeIsolatedFakeHome()
    })

    afterEach(() => {
      rmSync(repo, { recursive: true, force: true })
      rmSync(fakeHome, { recursive: true, force: true })
    })

    it('baseline: wp setup scaffolds the agent surface and exits 0 without needing --yes', () => {
      const r = runAk(['setup', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(existsSync(path.join(repo, '.agent'))).toBe(true)
      expect(existsSync(path.join(repo, 'AGENTS.md'))).toBe(true)
      expect(existsSync(path.join(repo, 'blueprints'))).toBe(true)
      expect(existsSync(path.join(repo, '.webpressorc.json'))).toBe(true)
      // Default-on base-kit: minimum bootstrap artifacts should exist even when
      // --with is omitted.
      expect(existsSync(path.join(repo, '.actrc'))).toBe(true)
      expect(existsSync(path.join(repo, 'Brewfile'))).toBe(false)
      expect(existsSync(path.join(repo, '.node-version'))).toBe(true)
      expect(existsSync(path.join(repo, '.nvmrc'))).toBe(true)
      expect(existsSync(path.join(repo, '.husky', 'pre-commit'))).toBe(true)
      expect(existsSync(path.join(repo, '.husky', 'commit-msg'))).toBe(false)
      expect(existsSync(path.join(repo, '.husky', 'pre-push'))).toBe(false)
      expect(existsSync(path.join(repo, 'scripts', 'check-no-dev-vars.ts'))).toBe(false)
      expect(existsSync(path.join(repo, 'scripts', 'resolve-webpresso-cli-versions.js'))).toBe(
        true,
      )

      // Future-proof guard: PreToolUse should be fail-closed (deny JSON
      // fallback), not silent fail-open `|| true`.
      const codex = JSON.parse(readFileSync(path.join(repo, '.codex', 'hooks.json'), 'utf8')) as {
        hooks: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> }
      }
      const preToolCommand = codex.hooks.PreToolUse?.[0]?.hooks?.[0]?.command ?? ''
      expect(preToolCommand).toContain('"permissionDecision":"deny"')
      expect(preToolCommand).not.toContain('|| true')
      expect(r.stdout).toContain('wp init: setup phases finished.')
      expect(r.stdout).toContain('Runtime-owned tooling contract:')
      expect(r.stdout).toContain(
        'wp now owns execution for test, e2e, lint, format, and typecheck.',
      )
      expect(r.stdout).toContain(
        'Do not blanket-remove devDependencies just because wp can execute the tool.',
      )
    })

    it('--prune removes stale agent-kit plugin cache versions from every existing supported cache root', () => {
      const oldClaude = writePluginCacheVersion(
        fakeHome,
        ['.claude', 'plugins', 'cache'],
        'webpresso',
        '0.34.5',
      )
      const currentClaude = writePluginCacheVersion(
        fakeHome,
        ['.claude', 'plugins', 'cache'],
        'webpresso',
        '1.1.0',
      )
      const oldCodex = writePluginCacheVersion(
        fakeHome,
        ['.codex', 'plugins', 'cache'],
        'webpresso',
        '0.34.5',
      )
      const currentCodex = writePluginCacheVersion(
        fakeHome,
        ['.codex', 'plugins', 'cache'],
        'webpresso',
        '1.1.0',
      )
      const oldOpenCode = writePluginCacheVersion(
        fakeHome,
        ['.config', 'opencode', 'plugins', 'cache'],
        'webpresso',
        '0.34.5',
      )
      const currentOpenCode = writePluginCacheVersion(
        fakeHome,
        ['.config', 'opencode', 'plugins', 'cache'],
        'webpresso',
        '1.1.0',
      )

      const r = runAk(['setup', '--yes', '--prune', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
        WP_SKIP_GSTACK: '1',
      })

      expect(r.code).toBe(0)
      expect(r.stdout).toContain('plugin cache prune: removed 3 outdated cache version(s)')
      expect(r.stdout).toContain('claude: removed 1; kept 1.1.0')
      expect(r.stdout).toContain('codex: removed 1; kept 1.1.0')
      expect(r.stdout).toContain('opencode: removed 1; kept 1.1.0')
      expect(existsSync(oldClaude)).toBe(false)
      expect(existsSync(oldCodex)).toBe(false)
      expect(existsSync(oldOpenCode)).toBe(false)
      expect(existsSync(currentClaude)).toBe(true)
      expect(existsSync(currentCodex)).toBe(true)
      expect(existsSync(currentOpenCode)).toBe(true)
    })

    it('bootstrap: --with base-kit on an empty repo creates docs/hooks/scripts/act/test/e2e/ci scaffolds', () => {
      const r = runAk(['setup', '--yes', '--with', 'base-kit', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
        WP_SKIP_GSTACK: '1',
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('wp init: setup phases finished.')

      expect(existsSync(path.join(repo, '.agent'))).toBe(true)
      expect(existsSync(path.join(repo, 'AGENTS.md'))).toBe(true)
      expect(existsSync(path.join(repo, 'blueprints'))).toBe(true)
      expect(existsSync(path.join(repo, '.webpressorc.json'))).toBe(true)

      expect(existsSync(path.join(repo, 'docs', 'templates', 'blueprint.md'))).toBe(true)
      expect(existsSync(path.join(repo, 'scripts', 'check-no-dev-vars.ts'))).toBe(false)
      expect(existsSync(path.join(repo, 'scripts', 'audit-secret-provider-quarantine.ts'))).toBe(
        false,
      )
      expect(existsSync(path.join(repo, 'scripts', 'resolve-webpresso-cli-versions.js'))).toBe(
        true,
      )
      expect(existsSync(path.join(repo, '.husky', 'pre-commit'))).toBe(true)
      expect(existsSync(path.join(repo, '.husky', 'commit-msg'))).toBe(false)
      expect(existsSync(path.join(repo, '.husky', 'pre-push'))).toBe(false)
      expect(existsSync(path.join(repo, '.actrc'))).toBe(true)
      expect(existsSync(path.join(repo, 'Brewfile'))).toBe(false)
      expect(existsSync(path.join(repo, '.node-version'))).toBe(true)
      expect(existsSync(path.join(repo, '.nvmrc'))).toBe(true)
      expect(existsSync(path.join(repo, 'test', '.gitkeep'))).toBe(true)
      expect(existsSync(path.join(repo, 'e2e', '.gitkeep'))).toBe(true)
      expect(
        existsSync(path.join(repo, '.github', 'actions', 'setup-webpresso', 'action.yml')),
      ).toBe(true)
      expect(existsSync(path.join(repo, '.github', 'workflows', 'ci.yml'))).toBe(true)
    })

    it('--with omx + fake omx on PATH: exits 0 and chains omx setup', () => {
      const r = runAk(['setup', '--yes', '--with', 'omx', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('omx setup: ✓')
      expect(r.stdout).toContain('omx-fixture: setup --yes --scope user ran')
    })

    it('--project + fake omx on PATH: chains project-scoped omx setup', () => {
      const r = runAk(['setup', '--yes', '--with', 'omx', '--project', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('omx setup: ✓')
      expect(r.stdout).toContain('omx-fixture: setup --yes --scope project ran')
    })

    it('--with omx re-applies agent hooks after omx rewrites codex hooks back to relative commands', () => {
      const r = runAk(['setup', '--yes', '--with', 'omx', '--cwd', repo], {
        PATH: makeRewritingOmxPath(repo),
        HOME: fakeHome,
      })

      expect(r.code).toBe(0)

      const codex = JSON.parse(readFileSync(path.join(repo, '.codex', 'hooks.json'), 'utf8')) as {
        hooks: {
          SessionStart: Array<{ hooks: Array<{ command: string }> }>
          Stop: Array<{ hooks: Array<{ command: string }> }>
        }
      }

      const sessionCommands = codex.hooks.SessionStart.flatMap((group) =>
        group.hooks.map((hook) => hook.command),
      )
      const stopCommands = codex.hooks.Stop.flatMap((group) =>
        group.hooks.map((hook) => hook.command),
      )

      const sessionRoutingBin = path.join(
        repo,
        '.codex',
        'managed-hooks',
        'wp-sessionstart-routing.sh',
      )
      const stopQaBin = path.join(repo, '.codex', 'managed-hooks', 'wp-stop-qa.sh')
      // CODEX_BIN produces guarded commands: `[ -x '<abs>' ] && '<abs>' || true`
      expect(
        sessionCommands.some(
          (cmd) => cmd.includes(sessionRoutingBin) && !cmd.includes('./node_modules'),
        ),
      ).toBe(true)
      expect(
        stopCommands.some((cmd) => cmd.includes(stopQaBin) && !cmd.includes('./node_modules')),
      ).toBe(true)
      expect(
        sessionCommands.every(
          (cmd) => !cmd.includes('./node_modules/.bin/wp-sessionstart-routing'),
        ),
      ).toBe(true)
      expect(stopCommands.every((cmd) => !cmd.includes('./node_modules/.bin/wp-stop-qa'))).toBe(
        true,
      )
      expect(sessionCommands.every((cmd) => !cmd.includes('node_modules/.bin'))).toBe(true)
      expect(stopCommands.every((cmd) => !cmd.includes('node_modules/.bin'))).toBe(true)

      const siblingCwd = mkdtempSync(path.join(repo, 'codex-runtime-'))
      const allCommands = ['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop']
        .flatMap((event) =>
          (codex.hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command)),
        )
        .filter((command) => command.includes('/.codex/managed-hooks/wp-'))

      for (const command of allCommands) {
        const result = spawnSync('sh', ['-lc', command], {
          cwd: siblingCwd,
          encoding: 'utf8',
          env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
        })
        expect(result.status, `${command}\n${result.stderr}`).toBe(0)
      }
    })

    it('--with omx + omx not on PATH: exits 1 with not-found hint', () => {
      const r = runAk(['setup', '--yes', '--with', 'omx', '--cwd', repo], {
        PATH: pathWithoutOmx(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(1)
      expect(r.stderr).toContain('not on PATH')
    })

    it('--with omx + omx setup fails: exits 3 (EXIT_WRITE_FAIL)', () => {
      const r = runAk(['setup', '--yes', '--with', 'omx', '--cwd', repo], {
        PATH: pathWithFakeOmxFail(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(3)
      expect(r.stderr).toContain('exited with 5')
    })

    it('--with gstack + fake HOME with gstack pre-installed: exits 0, "updated"', () => {
      const r = runAk(['setup', '--yes', '--with', 'gstack', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('gstack: ✓ updated')
      expect(r.stdout).toContain(path.join(fakeHome, '.claude', 'skills', 'gstack'))
    })

    it('--with gstack + detected codex: materializes codex skills from the canonical checkout', () => {
      mkdirSync(path.join(fakeHome, '.codex'), { recursive: true })
      writeFileSync(path.join(fakeHome, '.codex', 'config.toml'), 'model = "gpt-5.4"\n')

      const r = runAk(['setup', '--yes', '--with', 'gstack', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })

      expect(r.code).toBe(0)
      expect(r.stdout).toContain('gstack: ✓ updated')
      expect(r.stdout).toContain(
        `gstack (codex): ✓ installed at ${path.join(fakeHome, '.codex', 'skills')}`,
      )
    })

    it(
      '--with omx,gstack combined: both presets execute against fixtures',
      { timeout: 20_000 },
      () => {
        const r = runAk(['setup', '--yes', '--with', 'omx,gstack', '--cwd', repo], {
          PATH: pathWithFakeOmxOk(),
          HOME: fakeHome,
        })
        expect(r.code).toBe(0)
        expect(r.stdout).toContain('omx setup: ✓')
        expect(r.stdout).toContain('gstack: ✓ updated')
      },
    )

    it(
      'presets run independently: omx failure does NOT skip gstack, exit code reflects partial failure',
      { timeout: 20_000 },
      () => {
        const r = runAk(['setup', '--yes', '--with', 'omx,gstack', '--cwd', repo], {
          PATH: pathWithoutOmx(),
          HOME: fakeHome,
        })
        // omx fails (not on PATH) → contributes EXIT_SETUP_FAIL = 1
        expect(r.code).toBe(1)
        expect(r.stderr).toContain('not on PATH')
        // gstack still runs after omx fails — independent presets aren't
        // coupled. Verify it succeeded against the fake-home fixture.
        expect(r.stdout).toContain('gstack: ✓ updated')
      },
    )

    it('runtime check: prints bun + vp + actionlint status regardless of presets', () => {
      const r = runAk(['setup', '--yes', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('Runtime check:')
      expect(r.stdout).toMatch(/bun:/)
      expect(r.stdout).toMatch(/vp:/)
      expect(r.stdout).toMatch(/actionlint:/)
    })

    it('runtime check: missing tool prints install hint, exit still 0', () => {
      const r = runAk(['setup', '--yes', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      // Runtime checks are non-blocking; setup itself still succeeds
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('bun: ✗ not on PATH')
      expect(r.stdout).toContain('vp: ✗ not on PATH')
      expect(r.stdout).toContain('actionlint: ✗ not on PATH')
    })

    it('rejects unknown --with values with exit code 1', () => {
      const r = runAk(['setup', '--yes', '--with', 'definitely-not-a-skill', '--cwd', repo])
      expect(r.code).toBe(1)
    })

    it('--help text auto-lists every preset (data-driven from PRESETS const)', () => {
      const r = runAk(['setup', '--help'])
      expect(r.code).toBe(0)
      // Locks in the auto-generated help so adding a preset to PRESETS
      // automatically surfaces in --help and docs/code can't drift
      // (the original gap that prompted docs/add-ons.md to exist).
      expect(r.stdout).toContain('Presets:')
      expect(r.stdout).toContain('lore-commits')
      expect(r.stdout).toContain('omc')
      expect(r.stdout).toContain('omx')
      expect(r.stdout).toContain('playwright-mcp')
      expect(r.stdout).toContain('rtk')
      expect(r.stdout).toContain('gstack')
      expect(r.stdout).toContain("'wp skill list'")
    })
  },
)
