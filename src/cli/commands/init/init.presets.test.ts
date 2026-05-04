/**
 * Integration tests for the OMX and gstack scaffolder presets, exercised
 * through the full `runInit()` machinery.
 *
 * `node:child_process.spawnSync` is mocked at module-load so the presets
 * don't actually invoke `omx setup` or clone gstack — the integration
 * boundary is the spawn call. Filesystem scaffolding still runs for real
 * against a tmpdir per test, so we also assert the agent surface is laid
 * down correctly when presets are active.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.fn()

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
  }
})

import {
  EXIT_SETUP_FAIL,
  EXIT_SUCCESS,
  EXIT_WRITE_FAIL,
  runInit,
} from './index.js'

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ak-init-presets-'))
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

  beforeEach(() => {
    repo = makeRepo()
    originalCodexHome = process.env.CODEX_HOME
    originalHome = process.env.HOME
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.HOME = join(repo, '.home')
    spawnSyncMock.mockReset()
    spawnSyncMock.mockImplementation(() => okSpawnResult)
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
    rmSync(repo, { recursive: true, force: true })
  })

  describe('--with omx', () => {
    it('returns SUCCESS and invokes omx --version then omx setup --yes', async () => {
      const code = await runInit({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(2)
      expect(omxCalls[0]?.[1]).toEqual(['--version'])
      expect(omxCalls[1]?.[1]).toEqual(['setup', '--yes'])
      expect(readFileSync(join(repo, '.codex-home/config.toml'), 'utf8')).toContain(
        '[mcp_servers.playwright]',
      )
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
      const code = await runInit({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_SETUP_FAIL)
    })

    it('returns EXIT_SETUP_FAIL when probe exits non-zero (omx is broken)', async () => {
      spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'omx' && args[0] === '--version') {
          return { ...okSpawnResult, status: 127 }
        }
        return okSpawnResult
      })
      const code = await runInit({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_SETUP_FAIL)
    })

    it('returns EXIT_WRITE_FAIL when omx setup itself fails', async () => {
      spawnSyncMock.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'omx' && args[0] === '--version') return { ...okSpawnResult, status: 0 }
        if (cmd === 'omx' && args[0] === 'setup') return { ...okSpawnResult, status: 5 }
        return okSpawnResult
      })
      const code = await runInit({ cwd: repo, yes: true, with: 'omx' })
      expect(code).toBe(EXIT_WRITE_FAIL)
    })

    it('--dry-run does not invoke omx at all', async () => {
      await runInit({ cwd: repo, yes: true, with: 'omx', 'dry-run': true })
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(0)
    })
  })

  describe('--with gstack', () => {
    it('returns SUCCESS and clones + runs setup --team when missing', async () => {
      // gstack install root absent: existsSync returns false (default tmpdir
      // doesn't contain ~/.claude/skills/gstack/setup unless the host happens
      // to have gstack — which is fine for local sweeps; in CI it's clean).
      // We mock spawn to succeed for both clone and ./setup.
      const code = await runInit({ cwd: repo, yes: true, with: 'gstack' })
      expect(code).toBe(EXIT_SUCCESS)
      // The exact spawn calls depend on whether the host has gstack installed;
      // we only assert that if a clone happened, it was for the right repo.
      const gitCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'git')
      for (const call of gitCalls) {
        if (call[1]?.[0] === 'clone') {
          expect(call[1]).toContain('https://github.com/garrytan/gstack.git')
        }
      }
    })

    it('--dry-run does not invoke git or ./setup', async () => {
      await runInit({ cwd: repo, yes: true, with: 'gstack', 'dry-run': true })
      const gstackCalls = spawnSyncMock.mock.calls.filter(
        (c) => c[0] === 'git' || c[0] === './setup',
      )
      expect(gstackCalls).toHaveLength(0)
    })
  })

  describe('--with omx,gstack (combined)', () => {
    it('invokes both presets when separated by comma', async () => {
      const code = await runInit({ cwd: repo, yes: true, with: 'omx,gstack' })
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
      const code = await runInit({ cwd: repo, yes: true, with: 'omx,gstack' })
      expect(code).toBe(EXIT_SETUP_FAIL)
      // gstack still ran; the aggregate exit code reflects the omx failure.
    })
  })

  describe('runtime check (always-on)', () => {
    it('runs default external presets and probes bun/vp without --with flags', async () => {
      await runInit({ cwd: repo, yes: true })
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      const gstackCloneCalls = spawnSyncMock.mock.calls.filter(
        (c) => c[0] === 'git' && Array.isArray(c[1]) && c[1][0] === 'clone',
      )
      const bunCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'bun')
      const vpCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'vp')
      expect(omxCalls).toHaveLength(2)
      expect(gstackCloneCalls).toHaveLength(1)
      expect(bunCalls).toHaveLength(1)
      expect(vpCalls).toHaveLength(1)
      expect(bunCalls[0]?.[1]).toEqual(['--version'])
      expect(vpCalls[0]?.[1]).toEqual(['--version'])
    })

    it('--dry-run skips runtime probes', async () => {
      await runInit({ cwd: repo, yes: true, 'dry-run': true })
      const bunCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'bun')
      const vpCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'vp')
      expect(bunCalls).toHaveLength(0)
      expect(vpCalls).toHaveLength(0)
    })
  })

  describe('preset parsing edge cases', () => {
    it('unknown values that are neither preset nor Tier-3 skill fail Tier-3 validation', async () => {
      // parsePresets() filters to known PRESETS; everything else is forwarded
      // to Tier-3 skill resolution. If it's not a real Tier-3 skill either,
      // resolveTier3Selection rejects it and runInit returns EXIT_SETUP_FAIL.
      // This is intentional defense-in-depth — caught by the existing
      // 'rejects unknown Tier-3 names' test in init.integration.test.ts.
      const code = await runInit({ cwd: repo, yes: true, with: 'made-up-preset' })
      expect(code).toBe(EXIT_SETUP_FAIL)
      const externalCalls = spawnSyncMock.mock.calls.filter(
        (c) => c[0] === 'omx' || c[0] === 'git' || c[0] === './setup',
      )
      // No external calls because we exit before the preset block runs.
      expect(externalCalls).toHaveLength(0)
    })

    it('whitespace around comma-separated presets is tolerated', async () => {
      const code = await runInit({ cwd: repo, yes: true, with: ' omx , gstack ' })
      expect(code).toBe(EXIT_SUCCESS)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(2)
    })

    it('preset + invalid Tier-3 skill still fails Tier-3 validation', async () => {
      // Even though `omx` is a valid preset, the unknown `fake-thing`
      // routes to Tier-3 resolution and aborts the run before any preset
      // executes. Documented here so this contract is intentional.
      const code = await runInit({ cwd: repo, yes: true, with: 'omx,fake-thing' })
      expect(code).toBe(EXIT_SETUP_FAIL)
      const omxCalls = spawnSyncMock.mock.calls.filter((c) => c[0] === 'omx')
      expect(omxCalls).toHaveLength(0)
    })
  })
})
