/**
 * End-to-end tests that spawn the actual `ak` CLI as a subprocess with
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
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
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
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    env: {
      ...process.env,
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
  const dir = mkdtempSync(path.join(tmpdir(), 'ak-init-e2e-'))
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
  const dir = mkdtempSync(path.join(tmpdir(), 'ak-fake-home-'))
  cpSync(FAKE_HOME, dir, { recursive: true })
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

describe.skipIf(!existsSync(DIST_CLI_PATH) && !existsSync(SOURCE_CLI_PATH))(
  'ak setup — live e2e via subprocess',
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

    it('baseline: ak setup --yes scaffolds the agent surface and exits 0', () => {
      const r = runAk(['setup', '--yes', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(existsSync(path.join(repo, '.agent'))).toBe(true)
      expect(existsSync(path.join(repo, 'AGENTS.md'))).toBe(true)
      expect(existsSync(path.join(repo, 'blueprints'))).toBe(true)
      expect(existsSync(path.join(repo, '.agent-kitrc.json'))).toBe(true)
      expect(r.stdout).toContain('ak init: done.')
    })

    it('--with omx + fake omx on PATH: exits 0 and chains omx setup', () => {
      const r = runAk(['setup', '--yes', '--with', 'omx', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('omx setup: ✓')
      expect(r.stdout).toContain('omx-fixture: setup --yes ran')
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

    it('--with omx,gstack combined: both presets execute against fixtures', () => {
      const r = runAk(['setup', '--yes', '--with', 'omx,gstack', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('omx setup: ✓')
      expect(r.stdout).toContain('gstack: ✓ updated')
    })

    it('presets run independently: omx failure does NOT skip gstack, exit code reflects worst failure', () => {
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
    })

    it('runtime check: prints bun + vp status regardless of presets', () => {
      const r = runAk(['setup', '--yes', '--cwd', repo], {
        PATH: pathWithFakeOmxOk(),
        HOME: fakeHome,
      })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain('Runtime check:')
      expect(r.stdout).toMatch(/bun:/)
      expect(r.stdout).toMatch(/vp:/)
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
      // (the original gap that prompted docs/presets.md to exist).
      expect(r.stdout).toContain('Presets:')
      expect(r.stdout).toContain('lore-commits')
      expect(r.stdout).toContain('omx')
      expect(r.stdout).toContain('playwright-mcp')
      expect(r.stdout).toContain('rtk')
      expect(r.stdout).toContain('gstack')
      expect(r.stdout).toContain("'ak skill list'")
    })
  },
)
