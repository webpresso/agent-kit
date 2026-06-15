import { describe, expect, it } from 'vitest'

import {
  CAPABILITY_MATRIX,
  REPLACEMENT_PARITY_CAPABILITY_CROSSWALK,
  replacementParitySupportCeiling,
  validateReplacementParityCapabilityCrosswalk,
} from './capability-matrix.js'
import { buildCursorHooksConfig } from './emitters/cursor.js'
import { OPENCODE_HOOK_SUPPORT_BOUNDARY } from './emitters/opencode.js'
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
      expect(entry?.event).toBe(event)
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
      claude: 'full',
      codex: 'full',
      cursor: 'unsupported',
    })
  })

  it('pins Cursor emitted lifecycle support without claiming PreCompact parity', () => {
    const config = buildCursorHooksConfig({
      resolveBin: (name) => `./node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit', postToolBatch: 'Write|Edit' },
    })

    expect(Object.keys(config).sort()).toStrictEqual(
      ['beforeSubmitPrompt', 'postToolUse', 'preToolUse', 'sessionStart', 'stop', 'version'].sort(),
    )
    expect(Object.hasOwn(config, 'preCompact')).toBe(false)

    expect(CAPABILITY_MATRIX.find((c) => c.event === 'SessionStart')).toMatchObject({
      cursor: 'full',
    })
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'PreToolUse')).toMatchObject({
      cursor: 'full',
    })
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'PostToolUse')).toMatchObject({
      cursor: 'full',
    })
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'UserPromptSubmit')).toMatchObject({
      cursor: 'partial',
      notes: expect.stringContaining('beforeSubmitPrompt'),
    })
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'Stop')).toMatchObject({
      cursor: 'full',
      notes: expect.stringContaining('Cursor emits stop'),
    })
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'Stop')?.notes).not.toContain('afterShell')
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'PreCompact')).toMatchObject({
      cursor: 'unsupported',
      notes: expect.stringContaining('no PreCompact projection'),
    })
  })

  it('pins OpenCode degraded boundary support without overclaiming managed parity', () => {
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY.support).toBe('degraded')
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY.fullManagedEvents).toStrictEqual([
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
    ])
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY.degradedNativeCallbacks).toStrictEqual([
      'PermissionRequest',
      'PreCompact',
    ])
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY.unsupportedManagedEvents).toStrictEqual([
      'PostToolBatch',
      'PostToolUseFailure',
      'UserPromptSubmit',
      'Stop',
      'SubagentStart',
      'SubagentStop',
      'SessionEnd',
      'PostCompact',
    ])

    for (const event of OPENCODE_HOOK_SUPPORT_BOUNDARY.fullManagedEvents) {
      expect(CAPABILITY_MATRIX.find((c) => c.event === event)?.opencode).toBe('full')
    }
    for (const event of OPENCODE_HOOK_SUPPORT_BOUNDARY.degradedNativeCallbacks) {
      expect(CAPABILITY_MATRIX.find((c) => c.event === event)?.opencode).toBe('partial')
    }
    for (const event of OPENCODE_HOOK_SUPPORT_BOUNDARY.unsupportedManagedEvents) {
      expect(CAPABILITY_MATRIX.find((c) => c.event === event)?.opencode).toBe('unsupported')
    }

    expect(CAPABILITY_MATRIX.find((c) => c.event === 'SessionStart')?.notes).not.toContain(
      'experimental.session.compacting',
    )
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'PreCompact')?.notes).toContain(
      'OpenCode experimental.session.compacting',
    )
    expect(CAPABILITY_MATRIX.find((c) => c.event === 'Stop')?.notes).toContain(
      'OpenCode has no turn-end/stop lifecycle event',
    )
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
      'PostToolBatch',
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

  it('crosswalks replacement parity rows to canonical host lifecycle support ceilings', () => {
    const lifecycleCapture = REPLACEMENT_PARITY_CAPABILITY_CROSSWALK.find(
      (entry) => entry.capability === 'lifecycle capture',
    )
    const resumeInjection = REPLACEMENT_PARITY_CAPABILITY_CROSSWALK.find(
      (entry) => entry.capability === 'resume injection',
    )

    expect(lifecycleCapture).toStrictEqual({
      capability: 'lifecycle capture',
      events: ['PostToolUse', 'PostToolBatch', 'UserPromptSubmit', 'Stop', 'PreCompact'],
      hosts: ['claude', 'codex', 'cursor', 'opencode'],
      notes:
        'Host lifecycle capture is degraded until every covered host/event is full; store-only rows may remain scoped outside host parity.',
    })
    expect(resumeInjection).toStrictEqual({
      capability: 'resume injection',
      events: ['SessionStart'],
      hosts: ['claude', 'codex', 'cursor', 'opencode'],
      notes: 'Resume injection enters host context through SessionStart-compatible surfaces.',
    })
    expect(replacementParitySupportCeiling(lifecycleCapture!)).toBe('degraded')
    expect(replacementParitySupportCeiling(resumeInjection!)).toBe('full')
  })

  it('rejects full replacement parity claims when any covered host/event is not full', () => {
    const violations = validateReplacementParityCapabilityCrosswalk([
      {
        capability: 'lifecycle capture',
        hostScope: 'Claude, Codex, Cursor, OpenCode',
        supportLevel: 'full',
      },
      {
        capability: 'resume injection',
        hostScope: 'Claude, Codex, Cursor, OpenCode',
        supportLevel: 'full',
      },
    ])

    expect(violations).toEqual([
      {
        capability: 'lifecycle capture',
        message:
          'Replacement parity row "lifecycle capture" cannot claim full support because canonical host lifecycle support for claude, codex, cursor, opencode is degraded.',
      },
    ])
  })



  it('rejects generic full replacement parity rows that do not name canonical hosts', () => {
    const violations = validateReplacementParityCapabilityCrosswalk([
      {
        capability: 'host setup smoke',
        hostScope: 'tiered host smoke surfaces',
        supportLevel: 'full',
      },
    ])

    expect(violations).toEqual([
      {
        capability: 'host setup smoke',
        message:
          'Replacement parity row "host setup smoke" cannot claim full support without naming the covered canonical host(s).',
      },
    ])
  })

  it('allows degraded replacement parity claims for partial, unmapped, or unsupported host/event coverage', () => {
    expect(
      validateReplacementParityCapabilityCrosswalk([
        {
          capability: 'host setup smoke',
          hostScope: 'Claude, Codex, Cursor, OpenCode',
          supportLevel: 'degraded',
        },
      ]),
    ).toEqual([])
  })
})
