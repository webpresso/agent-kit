import { describe, expect, it } from 'vitest'

import { CAPABILITY_MATRIX } from '#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js'
import { generateCapabilityMatrix } from './generate-capability-matrix.js'

describe('generateCapabilityMatrix', () => {
  it('returns a string containing all event names from CAPABILITY_MATRIX', () => {
    const result = generateCapabilityMatrix()
    for (const entry of CAPABILITY_MATRIX) {
      expect(result).toContain(entry.event)
    }
  })

  it('contains all vendor column headers', () => {
    const result = generateCapabilityMatrix()
    expect(result).toContain('Claude Code')
    expect(result).toContain('Codex CLI')
    expect(result).toContain('Cursor')
    expect(result).toContain('OpenCode')
  })

  it('contains the checkmark symbol for full entries', () => {
    const result = generateCapabilityMatrix()
    expect(result).toContain('✅ full')
  })

  it('contains the cross symbol for unsupported entries', () => {
    const result = generateCapabilityMatrix()
    expect(result).toContain('❌ unsupported')
  })

  it('contains the warning symbol for partial entries', () => {
    const result = generateCapabilityMatrix()
    expect(result).toContain('⚠️ partial')
  })

  it('has a header row and a separator row', () => {
    const result = generateCapabilityMatrix()
    expect(result).toContain('| Event | Claude Code | Codex CLI | Cursor | OpenCode |')
    expect(result).toContain('|---|---|---|---|---|')
  })

  it('contains the footer note', () => {
    const result = generateCapabilityMatrix()
    expect(result).toContain('*unmapped: event exists in vendor but is not mapped through Cursor')
    expect(result).toContain('*unsupported: vendor does not support this event*')
    expect(result).toContain('*Source: catalog/agent/rules/supported-agent-clis.md*')
  })
})
