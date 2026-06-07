import { describe, expect, it } from 'vitest'

import { CAPABILITY_MATRIX } from './capability-matrix.js'
import { HOOK_EVENT_NAMES } from './ir.js'

describe('CAPABILITY_MATRIX', () => {
  it('contains an entry for every canonical HOOK_EVENT_NAME', () => {
    const matrixEvents = new Set(CAPABILITY_MATRIX.map((c) => c.event))
    for (const event of HOOK_EVENT_NAMES) {
      expect(matrixEvents.has(event)).toStrictEqual(true)
    }
  })

  it('claude column is full for all 5 canonical events', () => {
    for (const event of HOOK_EVENT_NAMES) {
      const entry = CAPABILITY_MATRIX.find((c) => c.event === event)
      expect(entry).toBeDefined()
      expect(entry?.claude).toStrictEqual('full')
    }
  })

  it('codex Stop is full', () => {
    const stop = CAPABILITY_MATRIX.find((c) => c.event === 'Stop')
    expect(stop?.codex).toStrictEqual('full')
  })

  it('codex UserPromptSubmit is unsupported', () => {
    const ups = CAPABILITY_MATRIX.find((c) => c.event === 'UserPromptSubmit')
    expect(ups?.codex).toStrictEqual('unsupported')
  })

  it('all support levels are valid SupportLevel values', () => {
    const validLevels = new Set(['full', 'partial', 'unmapped', 'unsupported'])
    for (const entry of CAPABILITY_MATRIX) {
      expect(validLevels.has(entry.claude)).toStrictEqual(true)
      expect(validLevels.has(entry.codex)).toStrictEqual(true)
      expect(validLevels.has(entry.cursor)).toStrictEqual(true)
    }
  })

  it('has entries for all extended events beyond the 5 canonical ones', () => {
    const extended = [
      'PermissionRequest',
      'SubagentStart',
      'SubagentStop',
      'PreCompact',
      'PostCompact',
    ]
    const matrixEvents = new Set(CAPABILITY_MATRIX.map((c) => c.event))
    for (const event of extended) {
      expect(matrixEvents.has(event)).toStrictEqual(true)
    }
  })
})
