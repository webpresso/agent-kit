/**
 * Integration tests for the OMX, OMC, and gstack scaffolder presets, exercised
 * through the full `runInit()` machinery.
 *
 * `node:child_process.spawnSync` is mocked at module-load so the presets
 * don't actually invoke `omx setup`, Claude plugin install, or clone gstack — the integration
 * boundary is the spawn call. Filesystem scaffolding still runs for real
 * against a tmpdir per test, so we also assert the agent surface is laid
 * down correctly when presets are active.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.fn()
const spawnMock = vi.fn()

class FakeAsyncChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid = 1234
  readonly kill = vi.fn(() => true)

  constructor() {
    super()
    queueMicrotask(() => {
      this.stdout.end()
      this.stderr.end()
      this.emit('close', 0, null)
    })
  }
}

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    spawn: (...args: unknown[]) => spawnMock(...args),
    spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
  }
})

import { EXIT_SETUP_FAIL, EXIT_SUCCESS, EXIT_WRITE_FAIL, runInit } from './index.js'

const silentStdout = { write: () => true }

function runInitSilently(flags: Parameters<typeof runInit>[0]): Promise<number> {
  return runInit(flags, { stdout: silentStdout })
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wp-init-presets-'))
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@acme/x', private: true }))
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
  return dir
}

// Note: spawnSync returns string-typed stdout/stderr when called with
// encoding: 'utf8' (as runtime-check does). Returning strings keeps the
// mock compatible with both string-mode and inherit-mode call sites.
const okSpawnResult = {
  status: 0,
  stdout: '',
  stderr: '',
  pid: 1,
  output: [],
  signal: null,
}

describe('runInit() — omx + gstack presets (integration)', () => {
  let repo: string
  let originalCodexHome: string | undefined
  let originalHome: string | undefined
  let originalCi: string | undefined
  let originalPath: string | undefined
  let consoleLogSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    repo = makeRepo()
    originalCodexHome = process.env.CODEX_HOME
    originalHome = process.env.HOME
    originalCi = process.env.CI
    originalPath = process.env.PATH
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.HOME = join(repo, '.home')
    const fakeBinDir = join(repo, 'bin')
    const fakeOmx = join(fakeBinDir, 'omx')
    mkdirSync(fakeBinDir, { recursive: true })
    writeFileSync(fakeOmx, '#!/usr/bin/env sh\necho 1.2.3\n', 'utf8')
    chmodSync(fakeOmx, 0o755)
    // Command detection now uses a real PATH scan (#runtime/command-exists), not the
    // mocked `which` spawnSync, so stage a real `claude` on PATH for the flows that
    // gate on it (Claude-plugin install, OMC). `codex` is intentionally NOT staged:
    // no assertion here needs codex detection, and the async `spawn` mock does not
    // model codex-plugin's install handshake (it would hang). The real codex
    // app-server boundary is deadline-guarded, so this is a test-mock gap, not a
    // product hang.
    const fakeClaude = join(fakeBinDir, 'claude')
    writeFileSync(fakeClaude, '#!/usr/bin/env sh\nexit 0\n', 'utf8')
    chmodSync(fakeClaude, 0o755)
    process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`
    // runInit() short-circuits the omx/gstack/rtk scaffolders when CI=true/1
    // (production guard against postinstall failures on hosted CI runners
    // that don't carry these dev-workstation tools). The integration tests
    // here exercise the real preset code paths through a mocked spawnSync,
    // so they must run outside the CI-skip branch — otherwise the mocks are
    // never invoked and every assertion against `spawnSyncMock.mock.calls`
    // sees an empty array. PATH-manipulation coverage of the CI-skip branch
    // lives in init.e2e.test.ts, where it belongs.
    delete process.env.CI
    spawnSyncMock.mockReset()
    spawnSyncMock.mockImplementation(() => okSpawnResult)
    spawnMock.mockReset()
    spawnMock.mockImplementation(() => new FakeAsyncChild())
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = originalCodexHome
    }
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    if (originalCi === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCi
    }
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }
    consoleLogSpy?.mockRestore()
    consoleWarnSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
    rmSync(repo, { recursive: true, force: true })
  })

  describe('--with omx', () => {
    // runInit() runs the gstack/rtk/claude-plugin orchestration for every preset
    // (gated only by WP_SKIP_*). These omx tests assert only omx + vp calls, but
    // that orchestration's awaited (mocked) spawns add enough event-loop latency
    // to push a test past the 10s timeout under full-suite parallel load — a
    // probabilistic flake across this block. Skip it (as the sibling --with omc
    // block does); the omx+gstack interaction has dedicated coverage in the
    // combined block below.
    let originalSkipGstack: string | undefined
    let originalSkipRtk: string | undefined
    let originalSkipClaudePlugin: string | undefined

    beforeEach(() => {
      originalSkipGstack = process.env.WP_SKIP_GSTACK
      originalSkipRtk = process.env.WP_SKIP_RTK
      originalSkipClaudePlugin = process.env.WP_SKIP_CLAUDE_PLUGIN
      process.env.WP_SKIP_GSTACK = '1'
      process.env.WP_SKIP_RTK = '1'
      process.env.WP_SKIP_CLAUDE_PLUGIN = '1'
    })

    afterEach(() => {
      if (originalSkipGstack === undefined) {
        delete process.env.WP_SKIP_GSTACK
      } else {
        process.env.WP_SKIP_GSTACK = originalSkipGstack
      }
      if (originalSkipRtk === undefined) {
        delete process.env.WP_SKIP_RTK
      } else {
        process.env.WP_SKIP_RTK = originalSkipRtk
      }
      if (originalSkipClaudePlugin === undefined) {
        delete process.env.WP_SKIP_CLAUDE_PLUGIN
      } else {
        process.env.WP_SKIP_CLAUDE_PLUGIN = originalSkipClaudePlugin
      }
    })

    it('returns SUCCESS and invokes omx --version then user-scoped omx setup', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      const vpUpdateCalls = spawnSyncMock.mock.calls.filter(
        (c) => c[0] === 'vp' && JSON.stringify(c[1]) === JSON.stringify(['update']),
      )
      const omxUpdateCalls = spawnSyncMock.mock.calls.filter(
        (c) =>
          c[0] === 'vp' && JSON.stringify(c[1]) === JSON.stringify(['update', '-g', 'oh-my-codex']),
      )
      expect(omxCalls).toHaveLength(2)
      expect(vpUpdateCalls).toHaveLength(0)
      expect(omxUpdateCalls).toHaveLength(0)
      expect(omxCalls[0]?.[1]).toEqual(['--version'])
      expect(omxCalls[1]?.[1]).toEqual(['setup', '--yes', '--scope', 'user'])
      expect(omxCalls[1]?.[2]).toMatchObject({
        cwd: repo,
        stdio: ['ignore', 'inherit', 'inherit'],
      })
      const codexConfig = readFileSync(join(repo, '.codex-home/config.toml'), 'utf8')
      expect(codexConfig).toContain('[mcp_servers.playwright]')
      expect(codexConfig).toContain('[mcp_servers.context7]')
      expect(codexConfig).toContain(
        'http_headers = { "Accept" = "application/json, text/event-stream" }',
      )
      expect(codexConfig).toContain(
        'env_http_headers = { "CONTEXT7_API_KEY" = "CONTEXT7_API_KEY" }',
      )

      const claudeMcpConfig = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8')) as {
        mcpServers: Record<string, unknown>
      }
      expect(claudeMcpConfig.mcpServers.context7).toStrictEqual({
        type: 'http',
        url: 'https://mcp.context7.com/mcp',
        headers: { CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}' },
      })
    })

    it('does not run gstack/rtk/claude orchestration on the omx-only path (hermetic skip)', async () => {
      // Regression guard for the under-load timeout flake: without the skip
      // guards, runInit() cloned gstack (git clone garrytan/gstack) and ran
      // rtk/claude orchestration via awaited spawns. Asserting the clone never
      // fires fails against that old behavior and proves the latency source is
      // gone — the omx-only path stays hermetic.
      await runInitSilently({ cwd: repo, yes: true, with: 'omx' })
      const gstackCloneCalls = spawnMock.mock.calls.filter(
        (call) => call[0] === 'git' && JSON.stringify(call[1] ?? '').includes('garrytan/gstack'),
      )
      expect(gstackCloneCalls).toStrictEqual([])
    })

    it('passes project scope to omx setup when --project is requested', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx', project: true })
      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls[1]?.[1]).toEqual(['setup', '--yes', '--scope', 'project'])
    })

    it('repairs .gitignore so regenerated Codex and OMX surfaces stay ignored', async () => {
      writeFileSync(join(repo, '.gitignore'), ['node_modules/', '!.codex/agents/**', ''].join('\n'))

      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx' })

      expect(code).toBe(EXIT_SUCCESS)
      const gitignore = readFileSync(join(repo, '.gitignore'), 'utf8')
      expect(gitignore).toContain('# >>> managed by webpresso (generated)')
      expect(gitignore).toContain('.codex/')
      expect(gitignore).toContain('.omx/')
      expect(gitignore).toContain('_worktrees/')
      expect(gitignore).toContain('.stryker-tmp/')
      expect(gitignore).toContain('reports/mutation/')
      expect(gitignore).toContain('reports/stryker-incremental.json')
      expect(gitignore).toContain('stryker-setup-*.js')
      expect(gitignore.trimEnd()).toMatch(/# <<< managed by webpresso \(generated\)$/)

      const gitRmCalls = spawnSyncMock.mock.calls.filter(
        (call) => call[0] === 'git' && Array.isArray(call[1]) && call[1][0] === 'rm',
      )
      expect(gitRmCalls).toHaveLength(1)
      expect(gitRmCalls[0]?.[1]).toEqual(
        expect.arrayContaining([
          'rm',
          '--cached',
          '-r',
          '--ignore-unmatch',
          '--',
          '.codex/',
          '.omx/',
          '_worktrees/',
          '.claude/settings.local.json',
          '.claude/rules/',
          '.claude/skills/',
          '.stryker-tmp/',
          'reports/mutation/',
          'reports/stryker-incremental.json',
          'stryker-setup-*.js',
        ]),
      )
      expect(gitRmCalls[0]?.[2]).toMatchObject({ cwd: repo, encoding: 'utf8' })
    })

    it('returns EXIT_SETUP_FAIL when probe errors with ENOENT (omx not on PATH)', async () => {
      spawnSyncMock.mockImplementation((cmd: string) => {
        if (cmd === 'omx') {
          return {
            ...okSpawnResult,
            status: null,
            error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
          }
        }
        return okSpawnResult
      })
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_SETUP_FAIL)
    })

    it('returns EXIT_SETUP_FAIL when probe exits non-zero (omx is broken)', async () => {
      spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'omx' && args[0] === '--version') {
          return { ...okSpawnResult, status: 127 }
        }
        return okSpawnResult
      })
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_SETUP_FAIL)
    })

    it('returns EXIT_WRITE_FAIL when omx setup itself fails', async () => {
      spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'omx' && args[0] === '--version') return { ...okSpawnResult, status: 0 }
        if (cmd === 'omx' && args[0] === 'setup') return { ...okSpawnResult, status: 5 }
        return okSpawnResult
      })
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_WRITE_FAIL)
    })

    it('--dry-run does not invoke omx at all', async () => {
      await runInitSilently({ cwd: repo, yes: true, with: 'omx', 'dry-run': true })
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(0)
    })
  })

  describe('--with omc', () => {
    let originalSkipGstack: string | undefined
    let originalSkipRtk: string | undefined
    let originalSkipClaudePlugin: string | undefined

    beforeEach(() => {
      originalSkipGstack = process.env.WP_SKIP_GSTACK
      originalSkipRtk = process.env.WP_SKIP_RTK
      originalSkipClaudePlugin = process.env.WP_SKIP_CLAUDE_PLUGIN
      process.env.WP_SKIP_GSTACK = '1'
      process.env.WP_SKIP_RTK = '1'
      process.env.WP_SKIP_CLAUDE_PLUGIN = '1'
    })

    afterEach(() => {
      if (originalSkipGstack === undefined) {
        delete process.env.WP_SKIP_GSTACK
      } else {
        process.env.WP_SKIP_GSTACK = originalSkipGstack
      }
      if (originalSkipRtk === undefined) {
        delete process.env.WP_SKIP_RTK
      } else {
        process.env.WP_SKIP_RTK = originalSkipRtk
      }
      if (originalSkipClaudePlugin === undefined) {
        delete process.env.WP_SKIP_CLAUDE_PLUGIN
      } else {
        process.env.WP_SKIP_CLAUDE_PLUGIN = originalSkipClaudePlugin
      }
    })

    it('installs OMC through user-scoped Claude Code plugin commands by default', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omc' })

      expect(code).toBe(EXIT_SUCCESS)
      const claudeCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'claude')
      expect(claudeCalls).toContainEqual([
        'claude',
        [
          'plugin',
          'marketplace',
          'add',
          '--scope',
          'user',
          'https://github.com/Yeachan-Heo/oh-my-claudecode',
        ],
        expect.any(Object),
      ])
      expect(claudeCalls).toContainEqual([
        'claude',
        ['plugin', 'install', '--scope', 'user', 'oh-my-claudecode'],
        expect.any(Object),
      ])
    })

    it('uses project scope for OMC when --project is requested', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omc', project: true })

      expect(code).toBe(EXIT_SUCCESS)
      const claudeCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'claude')
      expect(claudeCalls).toContainEqual([
        'claude',
        [
          'plugin',
          'marketplace',
          'add',
          '--scope',
          'project',
          'https://github.com/Yeachan-Heo/oh-my-claudecode',
        ],
        expect.any(Object),
      ])
    })

    it('--dry-run does not invoke Claude Code for OMC', async () => {
      await runInitSilently({ cwd: repo, yes: true, with: 'omc', 'dry-run': true })

      const omcClaudeCalls = spawnSyncMock.mock.calls.filter(
        (c) =>
          c[0] === 'claude' &&
          Array.isArray(c[1]) &&
          (c[1] as string[]).includes('oh-my-claudecode'),
      )
      expect(omcClaudeCalls).toHaveLength(0)
    })
  })

  describe('--with gstack', () => {
    it('returns SUCCESS and clones + runs setup --team when missing', async () => {
      // gstack install root absent: existsSync returns false (default tmpdir
      // doesn't contain ~/.claude/skills/gstack/setup unless the host happens
      // to have gstack — which is fine for local sweeps; in CI it's clean).
      // We mock spawn to succeed for both clone and ./setup.
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'gstack' })
      expect(code).toBe(EXIT_SUCCESS)
      // The exact spawn calls depend on whether the host has gstack installed;
      // we only assert that if a clone happened, it was for the right repo.
      const gitCalls = spawnMock.mock.calls.filter((c) => c[0] === 'git')
      for (const call of gitCalls) {
        if (call[1]?.[0] === 'clone') {
          expect(call[1]).toContain('https://github.com/garrytan/gstack.git')
        }
      }
    })

    it('--dry-run does not invoke git or ./setup', async () => {
      await runInitSilently({ cwd: repo, yes: true, with: 'gstack', 'dry-run': true })
      const gstackCalls = spawnMock.mock.calls.filter((c) => c[0] === 'git' || c[0] === './setup')
      expect(gstackCalls).toHaveLength(0)
    })
  })

  describe('--with rtk', () => {
    it('returns SUCCESS and invokes rtk --version then rtk init -g --auto-patch', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'rtk' })
      expect(code).toBe(EXIT_SUCCESS)
      const rtkCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'rtk')
      expect(rtkCalls).toHaveLength(2)
      expect(rtkCalls[0]?.[1]).toEqual(['--version'])
      expect(rtkCalls[1]?.[1]).toEqual(['init', '-g', '--auto-patch'])
      expect(rtkCalls[1]?.[2]).toEqual(
        expect.objectContaining({
          cwd: repo,
          stdio: 'inherit',
          env: expect.objectContaining({
            RTK_TELEMETRY_DISABLED: '1',
          }),
        }),
      )
    })

    it('--dry-run does not invoke rtk at all', async () => {
      await runInitSilently({ cwd: repo, yes: true, with: 'rtk', 'dry-run': true })
      const rtkCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'rtk')
      expect(rtkCalls).toHaveLength(0)
    })
  })

  describe('--with omx,gstack (combined)', () => {
    it('invokes both presets when separated by comma', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx,gstack' })
      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(2)
    })

    it('presets run independently: omx failure does NOT skip gstack, but exit code reflects omx failure', async () => {
      // Independent presets aren't coupled — gstack runs even when omx
      // failed. The aggregate exit code reflects the worst failure
      // (EXIT_SETUP_FAIL from omx wins over gstack's success). Verified
      // live in init.e2e.test.ts using PATH manipulation; here we only
      // verify the exit-code aggregation since spawn is fully mocked.
      spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'omx' && args[0] === '--version') {
          return {
            ...okSpawnResult,
            status: null,
            error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
          }
        }
        return okSpawnResult
      })
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx,gstack' })
      expect(code).toBe(EXIT_SETUP_FAIL)
      // gstack still ran; the aggregate exit code reflects the omx failure.
    })
  })

  describe('--with omx,rtk (combined)', () => {
    it('invokes both presets in deterministic order', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx,rtk' })
      expect(code).toBe(EXIT_SUCCESS)
      const calledTools = spawnSyncMock.mock.calls
        .map((call) => call[0])
        .filter((name) => name === 'omx' || name === 'rtk')
      expect(calledTools).toEqual(['omx', 'omx', 'rtk', 'rtk'])
    })
  })

  describe('--with omx,omc (combined)', () => {
    it('uses user scope for both OMX and OMC by default', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx,omc' })

      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      const claudeCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'claude')
      expect(omxCalls[1]?.[1]).toEqual(['setup', '--yes', '--scope', 'user'])
      expect(claudeCalls).toContainEqual([
        'claude',
        ['plugin', 'install', '--scope', 'user', 'oh-my-claudecode'],
        expect.any(Object),
      ])
    })

    it('passes project scope to both OMX and OMC when --project is requested', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx,omc', project: true })

      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      const claudeCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'claude')
      expect(omxCalls[1]?.[1]).toEqual(['setup', '--yes', '--scope', 'project'])
      expect(claudeCalls).toContainEqual([
        'claude',
        ['plugin', 'install', '--scope', 'project', 'oh-my-claudecode'],
        expect.any(Object),
      ])
    })
  })

  describe('runtime check (always-on)', () => {
    it('runs default external presets and probes bun/vp/actionlint without --with flags', async () => {
      await runInitSilently({ cwd: repo, yes: true })
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      const gstackCloneCalls = spawnMock.mock.calls.filter(
        (c) => c[0] === 'git' && Array.isArray(c[1]) && c[1][0] === 'clone',
      )
      const codexCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'codex')
      const bunCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'bun')
      const vpCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'vp')
      const actionlintCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'actionlint')
      expect(omxCalls).toHaveLength(2)
      expect(gstackCloneCalls).toHaveLength(1)
      expect(codexCalls.length).toBeGreaterThanOrEqual(1)
      expect(bunCalls).toHaveLength(1)
      // vp is used by setup preflight, runtime checks, and managed tool updates.
      // Assert the contract-critical calls instead of a brittle total; adding a
      // new preflight should not require this integration test to count every
      // internal vp probe by hand.
      expect(vpCalls.length).toBeGreaterThanOrEqual(2)
      expect(actionlintCalls).toHaveLength(1)
      expect(codexCalls[0]?.[1]).toEqual(['--version'])
      expect(bunCalls[0]?.[1]).toEqual(['--version'])
      expect(vpCalls.some((call) => JSON.stringify(call[1]) === JSON.stringify(['update']))).toBe(
        false,
      )
      expect(
        vpCalls.some(
          (call) => JSON.stringify(call[1]) === JSON.stringify(['update', '-g', 'oh-my-codex']),
        ),
      ).toBe(false)
      expect(
        vpCalls.some(
          (call) =>
            JSON.stringify(call[1]) ===
            JSON.stringify(['update', '-g', '--latest', '@openai/codex']),
        ),
      ).toBe(false)
      expect(
        vpCalls.filter((call) => JSON.stringify(call[1]) === JSON.stringify(['--version'])).length,
      ).toBeGreaterThanOrEqual(2)
      expect(actionlintCalls[0]?.[1]).toEqual(['--version'])
    })

    it('--dry-run skips runtime probes after preflight', async () => {
      await runInitSilently({ cwd: repo, yes: true, 'dry-run': true })
      const bunCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'bun')
      const vpCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'vp')
      const actionlintCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'actionlint')
      expect(bunCalls).toHaveLength(0)
      expect(vpCalls).toHaveLength(1)
      expect(actionlintCalls).toHaveLength(0)
      expect(vpCalls[0]?.[1]).toEqual(['--version'])
    })

    it('accepts CLI-normalized dryRun and skips external setup work', async () => {
      await runInitSilently({ cwd: repo, yes: true, dryRun: true })
      const externalSetupCalls = [...spawnSyncMock.mock.calls, ...spawnMock.mock.calls].filter(
        (c) =>
          ['omx', 'claude', 'git', './setup', 'rtk', 'bun', 'codex', 'actionlint'].includes(
            String(c[0]),
          ),
      )
      const vpCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'vp')

      expect(externalSetupCalls).toHaveLength(0)
      expect(vpCalls).toHaveLength(1)
      expect(vpCalls[0]?.[1]).toEqual(['--version'])
    })
  })

  describe('preset parsing edge cases', () => {
    it('unknown values that are neither preset nor Tier-3 skill fail Tier-3 validation', async () => {
      // parsePresets() filters to known PRESETS; everything else is forwarded
      // to Tier-3 skill resolution. If it's not a real Tier-3 skill either,
      // resolveTier3Selection rejects it and runInit returns EXIT_SETUP_FAIL.
      // This is intentional defense-in-depth — caught by the existing
      // 'rejects unknown Tier-3 names' test in init.integration.test.ts.
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'made-up-preset' })
      expect(code).toBe(EXIT_SETUP_FAIL)
      const externalCalls = [...spawnSyncMock.mock.calls, ...spawnMock.mock.calls].filter(
        (c) => c[0] === 'omx' || c[0] === 'git' || c[0] === './setup',
      )
      // No external calls because we exit before the preset block runs.
      expect(externalCalls).toHaveLength(0)
    })

    it('whitespace around comma-separated presets is tolerated', async () => {
      const code = await runInitSilently({ cwd: repo, yes: true, with: ' omx , gstack ' })
      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(2)
    })

    it('preset + invalid Tier-3 skill still fails Tier-3 validation', async () => {
      // Even though `omx` is a valid preset, the unknown `fake-thing`
      // routes to Tier-3 resolution and aborts the run before any preset
      // executes. Documented here so this contract is intentional.
      const code = await runInitSilently({ cwd: repo, yes: true, with: 'omx,fake-thing' })
      expect(code).toBe(EXIT_SETUP_FAIL)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(0)
    })
  })
})
