/**
 * consumers.ts contract tests.
 *
 * These tests assert the per-IDE wiring decisions recorded in consumers.ts so
 * that future refactors cannot accidentally silently regress the documented
 * surface for each IDE. Skill delivery is one channel per host: plugin hosts
 * (Claude, Codex) get no skill-dir projection by default; OpenCode gets its
 * primary `.opencode/skills/` root.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_UNIFIED_CONSUMERS,
  PLUGIN_FALLBACK_SKILL_CONSUMERS,
  selectUnifiedConsumers,
} from './consumers.js'

const skillDirs = (consumers: readonly { acceptsKind: string; dir: string }[]): string[] =>
  consumers.filter((c) => c.acceptsKind === 'skill').map((c) => c.dir)

// ---------------------------------------------------------------------------
// OpenCode surface contract
// ---------------------------------------------------------------------------

describe('OpenCode consumer contract', () => {
  it('DEFAULT_UNIFIED_CONSUMERS projects OpenCode skills to its primary .opencode/skills root', () => {
    const opencode = DEFAULT_UNIFIED_CONSUMERS.find((c) => c.id === 'opencode-skills')
    expect(opencode?.dir).toStrictEqual('.opencode/skills')
    expect(opencode?.acceptsKind).toStrictEqual('skill')
    expect(opencode?.strategy).toStrictEqual('symlink')
    expect(opencode?.host).toStrictEqual('opencode')
  })

  it('does not project the .claude/skills or .agents/skills fallback roots by default (avoids double-show)', () => {
    const dirs = DEFAULT_UNIFIED_CONSUMERS.map((c) => c.dir)
    expect(dirs).not.toContain('.claude/skills')
    expect(dirs).not.toContain('.agents/skills')
  })

  it('consumers.ts opencode comment documents the primary root without the old fallback denial', () => {
    const src = readFileSync(join(import.meta.dirname, 'consumers.ts'), 'utf8')
    expect(src).toMatch(/OpenCode's primary skill root/)
    expect(src).not.toMatch(/opencode does NOT read `\.claude\/skills\/`/)
  })
})

// ---------------------------------------------------------------------------
// Codex consumer contract (plugin is the channel)
// ---------------------------------------------------------------------------

describe('Codex consumer contract', () => {
  it('does not project rules or skills into .codex/agents', () => {
    const codexEntries = DEFAULT_UNIFIED_CONSUMERS.filter((c) => c.id.startsWith('codex'))
    expect(codexEntries).toHaveLength(0)
    expect(DEFAULT_UNIFIED_CONSUMERS.some((entry) => entry.dir === '.codex/agents')).toBe(false)
  })

  it('does not project any Codex skill dir by default (skills come from the Codex plugin)', () => {
    expect(skillDirs(DEFAULT_UNIFIED_CONSUMERS)).not.toContain('.agents/skills')
  })

  it('keeps .agents/skills only as a plugin opt-out fallback', () => {
    const fallback = PLUGIN_FALLBACK_SKILL_CONSUMERS.find((c) => c.dir === '.agents/skills')
    expect(fallback?.host).toStrictEqual('codex')
    expect(fallback?.pluginHost).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Claude + Gemini consumer contracts (regression guards)
// ---------------------------------------------------------------------------

describe('Claude + Gemini consumer contracts', () => {
  it('DEFAULT_UNIFIED_CONSUMERS maps claude-rules to .claude/rules but does NOT project claude skills', () => {
    const claudeRules = DEFAULT_UNIFIED_CONSUMERS.find((c) => c.id === 'claude-rules')
    expect(claudeRules?.dir).toStrictEqual('.claude/rules')
    expect(claudeRules?.strategy).toStrictEqual('symlink')

    const claudeSkills = DEFAULT_UNIFIED_CONSUMERS.find((c) => c.id === 'claude-skills')
    expect(claudeSkills).toStrictEqual(undefined)
  })

  it('keeps .claude/skills only as a plugin opt-out fallback', () => {
    const fallback = PLUGIN_FALLBACK_SKILL_CONSUMERS.find((c) => c.dir === '.claude/skills')
    expect(fallback?.host).toStrictEqual('claude')
    expect(fallback?.pluginHost).toBe(true)
  })

  it('DEFAULT_UNIFIED_CONSUMERS does not include gemini-commands', () => {
    const geminiEntry = DEFAULT_UNIFIED_CONSUMERS.find((c) => c.id === 'gemini-commands')
    expect(geminiEntry).toStrictEqual(undefined)
  })
})

// ---------------------------------------------------------------------------
// Host-gated projection (the single-channel-per-host contract)
// ---------------------------------------------------------------------------

describe('selectUnifiedConsumers host gating', () => {
  it('projects NO skill dir for a selected plugin host (claude) by default', () => {
    expect(skillDirs(selectUnifiedConsumers(['claude']))).not.toContain('.claude/skills')
    expect(skillDirs(selectUnifiedConsumers(['claude']))).not.toContain('.agents/skills')
  })

  it('projects NO skill dir for a selected plugin host (codex) by default', () => {
    expect(skillDirs(selectUnifiedConsumers(['codex']))).not.toContain('.agents/skills')
  })

  it('projects .opencode/skills for a selected opencode host', () => {
    expect(skillDirs(selectUnifiedConsumers(['opencode']))).toContain('.opencode/skills')
  })

  it('does NOT project .opencode/skills when opencode is not selected', () => {
    expect(skillDirs(selectUnifiedConsumers(['claude', 'codex']))).not.toContain('.opencode/skills')
  })

  it('re-enables .claude/skills only when WP_SKIP_CLAUDE_PLUGIN=1', () => {
    expect(skillDirs(selectUnifiedConsumers(['claude'], { WP_SKIP_CLAUDE_PLUGIN: '1' }))).toContain(
      '.claude/skills',
    )
  })

  it('re-enables .agents/skills only when WP_SKIP_CODEX_PLUGIN=1', () => {
    expect(skillDirs(selectUnifiedConsumers(['codex'], { WP_SKIP_CODEX_PLUGIN: '1' }))).toContain(
      '.agents/skills',
    )
  })

  it('does not re-enable another host’s fallback (opt-out is per host)', () => {
    expect(
      skillDirs(selectUnifiedConsumers(['claude'], { WP_SKIP_CODEX_PLUGIN: '1' })),
    ).not.toContain('.agents/skills')
  })

  it('always projects the canonical .agent/skills SSOT and .claude/rules regardless of host', () => {
    const none = selectUnifiedConsumers([])
    expect(none.map((c) => c.dir)).toContain('.agent/skills')
    expect(none.map((c) => c.dir)).toContain('.claude/rules')
  })

  it('undefined hosts yields the plugin-first default (no host skill dirs)', () => {
    expect(skillDirs(selectUnifiedConsumers(undefined))).not.toContain('.claude/skills')
    expect(skillDirs(selectUnifiedConsumers(undefined))).not.toContain('.agents/skills')
    expect(skillDirs(selectUnifiedConsumers(undefined))).not.toContain('.opencode/skills')
  })
})
