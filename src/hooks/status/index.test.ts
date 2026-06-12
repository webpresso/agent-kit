import { describe, expect, it } from 'vitest'

import { deriveHookStatus, WP_HOOK_SPECS } from './index.js'

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
    expect(WP_HOOK_SPECS.length).toStrictEqual(5)
  })

  it('all specs have non-empty hook and event fields', () => {
    expect(WP_HOOK_SPECS.map((s) => ({ hook: s.hook, event: s.event }))).toStrictEqual([
      { hook: 'wp-sessionstart-routing', event: 'SessionStart' },
      { hook: 'wp-pretool-guard', event: 'PreToolUse' },
      { hook: 'wp-post-tool', event: 'PostToolUse' },
      { hook: 'wp-guard-switch', event: 'UserPromptSubmit' },
      { hook: 'wp-stop-qa', event: 'Stop' },
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
