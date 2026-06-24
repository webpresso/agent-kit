import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  deriveHookStatus,
  deriveHostSurfaceStatus,
  formatHostSurfaceStatusLine,
  WP_HOOK_SPECS,
  statusCommand,
} from './index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

type HookEntry = { readonly type: string; readonly command: string }
type HookGroup = { readonly matcher?: string; readonly hooks: readonly HookEntry[] }
type HooksMap = Record<string, readonly HookGroup[]>

/**
 * Build a HooksMap that contains every WP_HOOK_SPECS bin name so all hooks
 * appear as present.
 */
function buildFullHooksMap(): HooksMap {
  const hooksMap: HooksMap = {}
  for (const spec of WP_HOOK_SPECS) {
    const existing = hooksMap[spec.event] ?? []
    hooksMap[spec.event] = [
      ...existing,
      { hooks: [{ type: 'command', command: `/path/to/${spec.hook}` }] },
    ]
  }
  return hooksMap
}

/**
 * Build an empty HooksMap (no hooks installed).
 */
function buildEmptyHooksMap(): HooksMap {
  return {}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WP_HOOK_SPECS', () => {
  it('has one entry per canonical wp-* hook', () => {
    expect(WP_HOOK_SPECS.length).toStrictEqual(6)
  })

  it('all specs have non-empty hook and event fields', () => {
    expect(WP_HOOK_SPECS.map((s) => ({ hook: s.hook, event: s.event }))).toStrictEqual([
      { hook: 'wp-sessionstart-routing', event: 'SessionStart' },
      { hook: 'wp-pretool-guard', event: 'PreToolUse' },
      { hook: 'wp-post-tool', event: 'PostToolUse' },
      { hook: 'wp-guard-switch', event: 'UserPromptSubmit' },
      { hook: 'wp-stop-qa', event: 'Stop' },
      { hook: 'wp-precompact-snapshot', event: 'PreCompact' },
    ])
  })
})

describe('deriveHookStatus', () => {
  it('returns one entry per spec in WP_HOOK_SPECS', () => {
    const result = deriveHookStatus({
      hooksMap: buildFullHooksMap(),
      vendor: 'claude',
      manifestExists: true,
    })
    expect(result).toHaveLength(WP_HOOK_SPECS.length)
  })

  it('all installed → installed or enforcing when manifest exists', () => {
    const result = deriveHookStatus({
      hooksMap: buildFullHooksMap(),
      vendor: 'claude',
      manifestExists: true,
    })
    for (const detail of result) {
      expect(['installed', 'enforcing']).toContain(detail.status)
    }
  })

  it('wp-pretool-guard → enforcing when present and manifest exists', () => {
    const result = deriveHookStatus({
      hooksMap: buildFullHooksMap(),
      vendor: 'claude',
      manifestExists: true,
    })
    const guard = result.find((d) => d.hook === 'wp-pretool-guard')
    expect(guard?.status).toStrictEqual('enforcing')
  })

  it('non-guard hooks → installed when present and manifest exists', () => {
    const result = deriveHookStatus({
      hooksMap: buildFullHooksMap(),
      vendor: 'claude',
      manifestExists: true,
    })
    const nonGuards = result.filter((d) => d.hook !== 'wp-pretool-guard')
    for (const detail of nonGuards) {
      expect(detail.status).toStrictEqual('installed')
    }
  })

  it('reports the managed PreCompact snapshot hook when present', () => {
    const result = deriveHookStatus({
      hooksMap: {
        PreCompact: [
          {
            hooks: [
              {
                type: 'command',
                command: '/path/to/wp-precompact-snapshot',
              },
            ],
          },
        ],
      },
      vendor: 'codex',
      manifestExists: true,
    })

    expect(result).toContainEqual({
      hook: 'wp-precompact-snapshot',
      event: 'PreCompact',
      vendor: 'codex',
      status: 'installed',
    })
  })

  it('none present → all disabled when manifest exists', () => {
    const result = deriveHookStatus({
      hooksMap: buildEmptyHooksMap(),
      vendor: 'claude',
      manifestExists: true,
    })
    for (const detail of result) {
      expect(detail.status).toStrictEqual('disabled')
    }
  })

  it('manifestExists=false → all disabled regardless of hooksMap', () => {
    const result = deriveHookStatus({
      hooksMap: buildFullHooksMap(),
      vendor: 'codex',
      manifestExists: false,
    })
    for (const detail of result) {
      expect(detail.status).toStrictEqual('disabled')
    }
  })

  it('manifestExists=false with empty hooksMap → all disabled', () => {
    const result = deriveHookStatus({
      hooksMap: buildEmptyHooksMap(),
      vendor: 'codex',
      manifestExists: false,
    })
    for (const detail of result) {
      expect(detail.status).toStrictEqual('disabled')
    }
  })

  it('vendorState=disabled forces disabled status even when hooks are present', () => {
    const result = deriveHookStatus({
      hooksMap: buildFullHooksMap(),
      vendor: 'codex',
      manifestExists: true,
      vendorState: 'disabled',
    })
    for (const detail of result) {
      expect(detail.status).toStrictEqual('disabled')
    }
  })

  it('vendor field is set correctly on each detail', () => {
    const result = deriveHookStatus({
      hooksMap: buildEmptyHooksMap(),
      vendor: 'codex',
      manifestExists: true,
    })
    for (const detail of result) {
      expect(detail.vendor).toStrictEqual('codex')
    }
  })

  it('results are sorted by event then hook name', () => {
    const result = deriveHookStatus({
      hooksMap: buildFullHooksMap(),
      vendor: 'claude',
      manifestExists: true,
    })
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]
      const curr = result[i]
      // Ensure prev comes before or equal to curr in sort order
      if (prev && curr) {
        const eventCompare = prev.event.localeCompare(curr.event)
        if (eventCompare === 0) {
          expect(prev.hook.localeCompare(curr.hook)).toBeLessThanOrEqual(0)
        } else {
          expect(eventCompare).toBeLessThanOrEqual(0)
        }
      }
    }
  })
})

describe('deriveHostSurfaceStatus', () => {
  function withTempRepo(write: (repoRoot: string) => void): string {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wp-hooks-status-'))
    write(repoRoot)
    return repoRoot
  }

  it('reports packaged artifacts separately from active hook installation', () => {
    const repoRoot = withTempRepo((root) => {
      mkdirSync(join(root, '.claude-plugin'), { recursive: true })
      mkdirSync(join(root, '.codex-plugin'), { recursive: true })
      mkdirSync(join(root, 'hooks'), { recursive: true })
      mkdirSync(join(root, '.claude'), { recursive: true })
      mkdirSync(join(root, '.codex'), { recursive: true })
      writeFileSync(join(root, '.claude-plugin', 'plugin.json'), '{}')
      writeFileSync(
        join(root, '.codex-plugin', 'plugin.json'),
        JSON.stringify({
          mcpServers: './codex.mcp.json',
          hooks: './hooks/hooks.json',
        }),
      )
      writeFileSync(
        join(root, 'codex.mcp.json'),
        JSON.stringify({
          webpresso: { command: '${PLUGIN_ROOT}/bin/wp', args: ['mcp'] },
        }),
      )
      writeFileSync(join(root, 'hooks', 'hooks.json'), JSON.stringify({ hooks: {} }))
      writeFileSync(join(root, '.claude', 'settings.json'), '{}')
      writeFileSync(join(root, '.codex', 'hooks.json'), '{}')
    })
    try {
      const result = deriveHostSurfaceStatus(repoRoot)
      expect(result.find((surface) => surface.host === 'claude')).toMatchObject({
        packagedArtifact: 'installed',
        activeHooks: 'managed',
        lifecycle: 'full',
      })
      expect(result.find((surface) => surface.host === 'codex')).toMatchObject({
        packagedArtifact: 'installed',
        activeHooks: 'managed',
        lifecycle: 'full',
      })
      expect(result.find((surface) => surface.host === 'codex')?.ownership).toContain(
        'inert package metadata',
      )
      expect(result.find((surface) => surface.host === 'codex')?.ownership).toContain(
        '.codex/hooks.json',
      )
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('keeps partial/deferred hosts visible without treating them as failures', () => {
    const repoRoot = withTempRepo((root) => {
      mkdirSync(join(root, '.cursor'), { recursive: true })
      mkdirSync(join(root, '.opencode', 'plugins'), { recursive: true })
      writeFileSync(join(root, '.cursor', 'hooks.json'), '{}')
      writeFileSync(join(root, '.opencode', 'plugins', 'webpresso-hooks.js'), '')
    })
    try {
      const result = deriveHostSurfaceStatus(repoRoot)
      expect(result.find((surface) => surface.host === 'cursor')).toMatchObject({
        packagedArtifact: 'deferred',
        activeHooks: 'managed',
        lifecycle: 'degraded',
        required: false,
      })
      expect(result.find((surface) => surface.host === 'opencode')).toMatchObject({
        packagedArtifact: 'installed',
        activeHooks: 'plugin-bridge',
        lifecycle: 'degraded',
        required: false,
      })
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it('formats host surface status summary-first and bounded', () => {
    const line = formatHostSurfaceStatusLine({
      host: 'opencode',
      packagedArtifact: 'installed',
      activeHooks: 'plugin-bridge',
      lifecycle: 'degraded',
      required: false,
      ownership:
        'plugin bridge owns OpenCode integration; unsupported lifecycle events remain explicit',
    })

    expect(line).toContain('opencode')
    expect(line).toContain('artifact=installed')
    expect(line).toContain('active=plugin-bridge')
    expect(line).toContain('lifecycle=degraded')
    expect(line.length).toBeLessThan(180)
  })
})

describe('statusCommand source-repo guidance', () => {
  it('prints source-aware setup guidance when the source repo manifest is missing', async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'wp-hooks-status-source-'))
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    mkdirSync(join(repoRoot, 'src', 'cli'), { recursive: true })
    writeFileSync(join(repoRoot, 'src', 'cli', 'cli.ts'), '')
    const previousCwd = process.cwd()
    let output = ''
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        output += String(chunk)
        return true
      })

    try {
      process.chdir(repoRoot)
      await statusCommand(['--vendor', 'codex'])
    } finally {
      process.chdir(previousCwd)
      writeSpy.mockRestore()
      rmSync(repoRoot, { recursive: true, force: true })
    }

    expect(output).toContain('WP_FORCE_SOURCE=1 wp setup --source-maintenance')
  })
})
