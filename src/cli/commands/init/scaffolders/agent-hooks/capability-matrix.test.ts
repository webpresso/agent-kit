import { describe, expect, it } from 'vitest'

import { CAPABILITY_MATRIX } from './capability-matrix.js'
import { HOOK_EVENT_NAMES, MANAGED_HOOK_EVENT_NAMES } from './ir.js'

describe('CAPABILITY_MATRIX', () => {
  it('contains an entry for every canonical HOOK_EVENT_NAME', () => {
    const matrixEvents = new Set(CAPABILITY_MATRIX.map((c) => c.event))
    for (const event of HOOK_EVENT_NAMES) {
      expect(matrixEvents.has(event)).toStrictEqual(true)
    }
  })

  it('claude column is full only for the emitted managed hook-event subset', () => {
    const managedEvents = new Set(MANAGED_HOOK_EVENT_NAMES)
    for (const event of HOOK_EVENT_NAMES) {
      const entry = CAPABILITY_MATRIX.find((c) => c.event === event)
      expect(entry).toBeDefined()
      expect(entry?.claude === 'full').toStrictEqual(managedEvents.has(event))
    }
  })

  it('codex Stop is full', () => {
    const stop = CAPABILITY_MATRIX.find((c) => c.event === 'Stop')
    expect(stop?.codex).toStrictEqual('full')
  })

  it('codex UserPromptSubmit is full because setup emits it today', () => {
    const ups = CAPABILITY_MATRIX.find((c) => c.event === 'UserPromptSubmit')
    expect(ups?.codex).toStrictEqual('full')
  })

  it('richer native events are recorded as partial/unmapped rather than falsely marked full', () => {
    const permissionRequest = CAPABILITY_MATRIX.find((c) => c.event === 'PermissionRequest')
    const sessionEnd = CAPABILITY_MATRIX.find((c) => c.event === 'SessionEnd')
    const preCompact = CAPABILITY_MATRIX.find((c) => c.event === 'PreCompact')

    expect(permissionRequest).toMatchObject({
      claude: 'partial',
      codex: 'partial',
      cursor: 'unmapped',
    })
    expect(sessionEnd).toMatchObject({
      claude: 'partial',
      codex: 'unsupported',
      cursor: 'unsupported',
    })
    expect(preCompact).toMatchObject({
      claude: 'partial',
      codex: 'partial',
      cursor: 'unsupported',
    })
  })

  it('all support levels are valid SupportLevel values', () => {
    const validLevels = new Set(['full', 'partial', 'unmapped', 'unsupported'])
    for (const entry of CAPABILITY_MATRIX) {
      expect(validLevels.has(entry.claude)).toStrictEqual(true)
      expect(validLevels.has(entry.codex)).toStrictEqual(true)
      expect(validLevels.has(entry.cursor)).toStrictEqual(true)
      expect(validLevels.has(entry.opencode)).toStrictEqual(true)
    }
  })

  it('opencode column: SessionStart/PreToolUse/PostToolUse are full (plugin bridges them)', () => {
    const bridged = ['SessionStart', 'PreToolUse', 'PostToolUse'] as const
    for (const event of bridged) {
      const entry = CAPABILITY_MATRIX.find((c) => c.event === event)
      expect(entry?.opencode).toStrictEqual('full')
    }
  })

  it('opencode column: UserPromptSubmit/Stop/SubagentStart/SubagentStop/SessionEnd/PostCompact are unsupported', () => {
    const degraded = [
      'UserPromptSubmit',
      'Stop',
      'SubagentStart',
      'SubagentStop',
      'SessionEnd',
      'PostCompact',
    ] as const
    for (const event of degraded) {
      const entry = CAPABILITY_MATRIX.find((c) => c.event === event)
      expect(entry?.opencode).toStrictEqual('unsupported')
    }
  })

  it('opencode column: PermissionRequest/PreCompact are partial (limited lifecycle parity)', () => {
    const partial = ['PermissionRequest', 'PreCompact'] as const
    for (const event of partial) {
      const entry = CAPABILITY_MATRIX.find((c) => c.event === event)
      expect(entry?.opencode).toStrictEqual('partial')
    }
  })

  it('cursor PermissionRequest is unmapped (not in third-party compat table)', () => {
    const entry = CAPABILITY_MATRIX.find((c) => c.event === 'PermissionRequest')
    expect(entry?.cursor).toStrictEqual('unmapped')
  })

  it('Stop notes document Codex JSON-only stdout requirement', () => {
    const stop = CAPABILITY_MATRIX.find((c) => c.event === 'Stop')
    expect(stop?.notes).toContain('JSON-only')
  })

  it('SubagentStop notes document Codex JSON-only stdout requirement', () => {
    const subagentStop = CAPABILITY_MATRIX.find((c) => c.event === 'SubagentStop')
    expect(subagentStop?.notes).toContain('JSON-only')
  })

  it('has entries for all extended events beyond the 5 canonical ones', () => {
    const extended = [
      'PostToolUseFailure',
      'PermissionRequest',
      'SubagentStart',
      'SubagentStop',
      'SessionEnd',
      'PreCompact',
      'PostCompact',
    ]
    const matrixEvents = new Set(CAPABILITY_MATRIX.map((c) => c.event))
    for (const event of extended) {
      expect(matrixEvents.has(event)).toStrictEqual(true)
    }
  })
})
