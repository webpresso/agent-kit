/**
 * consumers.ts contract tests.
 *
 * These tests assert the per-IDE wiring decisions recorded in consumers.ts so
 * that future refactors cannot accidentally silently regress the documented
 * surface for each IDE.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEFAULT_PER_SKILL_CONSUMERS, DEFAULT_UNIFIED_CONSUMERS } from './consumers.js'

// ---------------------------------------------------------------------------
// OpenCode surface contract (Task 1.8 — verified path A)
// ---------------------------------------------------------------------------

describe('OpenCode consumer contract', () => {
  it('DEFAULT_UNIFIED_CONSUMERS does not contain an opencode-* entry (opencode is covered by per-skill consumer, not unified)', () => {
    const opencodeEntries = DEFAULT_UNIFIED_CONSUMERS.filter((c) => c.id.startsWith('opencode'))
    expect(opencodeEntries).toHaveLength(0)
  })

  it('DEFAULT_PER_SKILL_CONSUMERS includes .agents/skills (the verified opencode skill surface)', () => {
    const dirs = DEFAULT_PER_SKILL_CONSUMERS.map((c) => c.dir)
    expect(dirs).toContain('.agents/skills')
  })

  it('consumers.ts opencode comment documents official roots without the old fallback denial', () => {
    const src = readFileSync(join(import.meta.dirname, 'consumers.ts'), 'utf8')
    expect(src).toMatch(
      /`\.opencode\/skills\/`, `\.claude\/skills\/`, and\s+ \*     `\.agents\/skills\/`/,
    )
    expect(src).not.toMatch(/opencode does NOT read `\.claude\/skills\/`/)
  })
})

// ---------------------------------------------------------------------------
// Codex consumer contract (regression guard)
// ---------------------------------------------------------------------------

describe('Codex consumer contract', () => {
  it('does not project rules or skills into .codex/agents', () => {
    const codexEntries = DEFAULT_UNIFIED_CONSUMERS.filter((c) => c.id.startsWith('codex'))
    expect(codexEntries).toHaveLength(0)
    expect(DEFAULT_UNIFIED_CONSUMERS.some((entry) => entry.dir === '.codex/agents')).toBe(false)
  })

  it('uses .agents/skills as the portable Codex skill projection', () => {
    const dirs = DEFAULT_PER_SKILL_CONSUMERS.map((c) => c.dir)
    expect(dirs).toContain('.agents/skills')
  })
})

// ---------------------------------------------------------------------------
// Claude + Gemini consumer contracts (regression guards)
// ---------------------------------------------------------------------------

describe('Claude + Gemini consumer contracts', () => {
  it('DEFAULT_UNIFIED_CONSUMERS maps claude-rules to .claude/rules and claude-skills to .claude/skills', () => {
    const claudeRules = DEFAULT_UNIFIED_CONSUMERS.find((c) => c.id === 'claude-rules')
    const claudeSkills = DEFAULT_UNIFIED_CONSUMERS.find((c) => c.id === 'claude-skills')

    expect(claudeRules?.dir).toStrictEqual('.claude/rules')
    expect(claudeRules?.strategy).toStrictEqual('symlink')
    expect(claudeSkills?.dir).toStrictEqual('.claude/skills')
    expect(claudeSkills?.strategy).toStrictEqual('symlink')
  })

  it('DEFAULT_UNIFIED_CONSUMERS does not include gemini-commands (Gemini is handled by legacy syncAll TOML generation)', () => {
    const geminiEntry = DEFAULT_UNIFIED_CONSUMERS.find((c) => c.id === 'gemini-commands')
    expect(geminiEntry).toStrictEqual(undefined)
  })
})
