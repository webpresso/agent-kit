import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  ensureOmx,
  migrateDeprecatedCodexHooksFeatureFlag,
  deduplicateCodexHookTrustState,
} from './index.js'

function makeSpawn(behaviors: Array<{ status: number | null; error?: Error }>) {
  let i = 0
  return vi.fn(() => {
    const next = behaviors[i] ?? { status: 0 }
    i++
    return {
      status: next.status,
      error: next.error,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1,
      output: [],
      signal: null,
    }
  }) as unknown as Parameters<typeof ensureOmx>[0]['spawn']
}

describe('ensureOmx', () => {
  it('returns omx-ok when probe and setup both succeed', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-ok', installed: false })
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('returns omx-skipped-dry-run without spawning anything', () => {
    const spawn = makeSpawn([])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: true },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-skipped-dry-run' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('installs oh-my-codex when omx is not on PATH, then runs setup', () => {
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 0 },
      { status: 0 },
      { status: 0 },
    ])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-ok', installed: true })
    expect(spawn).toHaveBeenNthCalledWith(2, 'npm', ['install', '-g', 'oh-my-codex'], {
      stdio: 'inherit',
    })
    expect(spawn).toHaveBeenNthCalledWith(4, 'omx', ['setup', '--yes'], {
      cwd: '/tmp/repo',
      stdio: 'inherit',
    })
  })

  it('returns omx-not-found when the fallback install fails', () => {
    const spawn = makeSpawn([
      { status: null, error: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
      { status: 1 },
    ])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result.kind).toBe('omx-not-found')
    if (result.kind === 'omx-not-found') {
      expect(result.hint).toContain('omx (oh-my-codex)')
    }
  })

  it('returns omx-not-found when probe exits non-zero', () => {
    const spawn = makeSpawn([{ status: 127 }, { status: 0 }, { status: 127 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result.kind).toBe('omx-not-found')
  })

  it('returns omx-spawn-failed when setup itself fails', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 2 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(result).toEqual({ kind: 'omx-spawn-failed', exitCode: 2 })
  })

  it('passes --yes to the setup invocation', () => {
    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
    })
    expect(spawn).toHaveBeenNthCalledWith(2, 'omx', ['setup', '--yes'], {
      cwd: '/tmp/repo',
      stdio: 'inherit',
    })
  })

  it('migrates deprecated codex_hooks to hooks in the Codex config after omx setup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-omx-'))
    const configPath = join(dir, 'config.toml')
    writeFileSync(
      configPath,
      '[features]\ncodex_hooks = true\ngoals = true\n\n[mcp_servers.playwright]\nenabled = true\n',
      'utf8',
    )

    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    const result = ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
      configPath,
    })

    expect(result).toEqual({ kind: 'omx-ok', installed: false })
    expect(readFileSync(configPath, 'utf8')).toBe(
      '[features]\nhooks = true\ngoals = true\n\n[mcp_servers.playwright]\nenabled = true\n',
    )
  })
})

describe('deduplicateCodexHookTrustState', () => {
  // These are OMX's constants — not imported to avoid coupling, tested by contract.
  const START = '# OMX-owned Codex hook trust state'
  const END = '# End OMX-owned Codex hook trust state'
  const COMMENT = '# Trusts only setup-managed codex-native-hook.js wrappers.'
  const KEY_A = '[hooks.state."/home/.codex/hooks.json:post_tool_use:0:0"]'
  const KEY_B = '[hooks.state."/home/.codex/hooks.json:session_start:0:0"]'
  const ENTRY_A = `${KEY_A}\ntrusted_hash = "sha256:aaa"`
  const ENTRY_B = `${KEY_B}\ntrusted_hash = "sha256:bbb"`

  it('returns config unchanged when there are no hook.state entries', () => {
    const config = '[features]\nhooks = true\n'
    expect(deduplicateCodexHookTrustState(config)).toBe(config)
  })

  it('returns config unchanged when all hook.state keys are unique (one managed block)', () => {
    const config = `[features]\nhooks = true\n\n${START}\n${COMMENT}\n${ENTRY_A}\n\n${ENTRY_B}\n${END}\n`
    expect(deduplicateCodexHookTrustState(config)).toBe(config)
  })

  it('strips all entries when any hook.state key appears more than once (legacy + managed block)', () => {
    // Simulates one legacy block (no start marker) + one managed block — KEY_A duplicated
    const legacy = `${ENTRY_A}\n${END}`
    const managed = `${START}\n${COMMENT}\n${ENTRY_A}\n\n${ENTRY_B}\n${END}`
    const config = `[features]\nhooks = true\n\n${legacy}\n\n${managed}\n`
    const result = deduplicateCodexHookTrustState(config)
    expect(result).not.toContain('[hooks.state.')
    expect(result).not.toContain('trusted_hash')
    expect(result).not.toContain(START)
    expect(result).not.toContain(END)
    expect(result).toContain('[features]')
  })

  it('strips all entries when three identical blocks accumulate', () => {
    const block = `${ENTRY_A}\n${END}`
    const config = `[features]\nhooks = true\n\n${block}\n\n${block}\n\n${block}\n`
    const result = deduplicateCodexHookTrustState(config)
    expect(result).not.toContain('[hooks.state.')
    expect(result).not.toContain('trusted_hash')
    expect(result).toContain('[features]')
  })

  it('does NOT strip when two blocks have fully distinct keys (unlikely but valid)', () => {
    const block1 = `${START}\n${COMMENT}\n${ENTRY_A}\n${END}`
    const block2 = `${START}\n${COMMENT}\n${ENTRY_B}\n${END}`
    const config = `[features]\nhooks = true\n\n${block1}\n\n${block2}\n`
    // No duplicate keys → unchanged; TOML validity is the contract, not block count
    expect(deduplicateCodexHookTrustState(config)).toBe(config)
  })

  it('preserves unrelated TOML sections around the stripped blocks', () => {
    const legacy = `${ENTRY_A}\n${END}`
    const managed = `${START}\n${COMMENT}\n${ENTRY_A}\n${END}`
    const config = `[features]\nhooks = true\n\n${legacy}\n\n[mcp_servers.playwright]\nenabled = true\n\n${managed}\n`
    const result = deduplicateCodexHookTrustState(config)
    expect(result).toContain('[features]')
    expect(result).toContain('[mcp_servers.playwright]')
    expect(result).not.toContain('[hooks.state.')
  })
})

describe('ensureOmx — deduplication of legacy hook trust state', () => {
  it('repairs a config with multiple end markers before calling omx setup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ak-omx-dedup-'))
    const configPath = join(dir, 'config.toml')
    const END = '# End OMX-owned Codex hook trust state'
    const ENTRY =
      '[hooks.state."/home/.codex/hooks.json:post_tool_use:0:0"]\ntrusted_hash = "sha256:abc"'
    // Two duplicate end-marker blocks simulating accumulated legacy state
    writeFileSync(
      configPath,
      `[features]\nhooks = true\n\n${ENTRY}\n${END}\n\n${ENTRY}\n${END}\n`,
      'utf8',
    )

    const spawn = makeSpawn([{ status: 0 }, { status: 0 }])
    ensureOmx({
      repoRoot: '/tmp/repo',
      options: { overwrite: false, dryRun: false },
      spawn,
      configPath,
    })

    const written = readFileSync(configPath, 'utf8')
    expect(written).not.toContain('[hooks.state.')
    expect(written).toContain('[features]')
  })
})

describe('migrateDeprecatedCodexHooksFeatureFlag', () => {
  it('rewrites codex_hooks to hooks inside the [features] table', () => {
    expect(
      migrateDeprecatedCodexHooksFeatureFlag('[features]\ncodex_hooks = true\ngoals = true\n'),
    ).toBe('[features]\nhooks = true\ngoals = true\n')
  })

  it('removes codex_hooks when hooks already exists and preserves the deprecated value', () => {
    expect(
      migrateDeprecatedCodexHooksFeatureFlag(
        '[features]\nhooks = false\ncodex_hooks = true\ngoals = true\n',
      ),
    ).toBe('[features]\nhooks = true\ngoals = true\n')
  })
})
