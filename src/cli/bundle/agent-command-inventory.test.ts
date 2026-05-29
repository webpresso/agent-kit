import { describe, expect, it } from 'vitest'

import {
  AGENT_COMMAND_INVENTORY,
  getLegacyAgentCommandReplacement,
} from '#cli/bundle/agent-command-inventory.js'

describe('AGENT_COMMAND_INVENTORY', () => {
  it('covers the expected future agent namespaces without legacy ids', () => {
    const ids = new Set(AGENT_COMMAND_INVENTORY.map((entry) => entry.id))

    expect(ids).toEqual(
      new Set([
        'agent setup',
        'agent sync',
        'agent audit',
        'agent skills',
        'agent docs lint',
        'agent hooks doctor',
        'agent blueprint',
        'agent test',
        'agent e2e',
        'agent tech-debt',
      ]),
    )

    for (const entry of AGENT_COMMAND_INVENTORY) {
      expect(entry.namespace).toBe('agent')
      expect(entry.visibility).toBe('public')
      expect(entry.id.startsWith('wp')).toBe(false)
      expect(entry.id.startsWith('ak')).toBe(false)
      expect(entry.id.startsWith('cli2')).toBe(false)
      expect(entry.id.startsWith('wk')).toBe(false)
      expect(entry.replacementCommand.startsWith('webpresso agent ')).toBe(true)
    }
  })

  it('maps current legacy commands to exact future replacements', () => {
    expect(getLegacyAgentCommandReplacement('wp setup')).toBe('webpresso agent setup')
    expect(getLegacyAgentCommandReplacement('wp sync')).toBe('webpresso agent sync')
    expect(getLegacyAgentCommandReplacement('wp audit')).toBe('webpresso agent audit')
    expect(getLegacyAgentCommandReplacement('wp skill')).toBe('webpresso agent skills')
    expect(getLegacyAgentCommandReplacement('wp docs lint')).toBe('webpresso agent docs lint')
    expect(getLegacyAgentCommandReplacement('wp hooks doctor')).toBe(
      'webpresso agent hooks doctor',
    )
    expect(getLegacyAgentCommandReplacement('wp blueprint')).toBe('webpresso agent blueprint')
    expect(getLegacyAgentCommandReplacement('wp test')).toBe('webpresso agent test')
    expect(getLegacyAgentCommandReplacement('wp e2e')).toBe('webpresso agent e2e')
    expect(getLegacyAgentCommandReplacement('wp tech-debt')).toBe('webpresso agent tech-debt')
  })

  it('returns null for unknown legacy commands', () => {
    expect(getLegacyAgentCommandReplacement('wp unknown')).toBeNull()
  })
})
