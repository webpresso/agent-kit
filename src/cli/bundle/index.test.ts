import { describe, expect, it } from 'vitest'

import { AGENT_BUNDLE } from '#cli/bundle/index.js'

describe('AGENT_BUNDLE', () => {
  it('exports the agent bundle under the agent command root', () => {
    expect(AGENT_BUNDLE.bundleId).toBe('agent-kit')
    expect(AGENT_BUNDLE.commandRoot).toBe('agent')
    expect(AGENT_BUNDLE.sourcePackage).toBe('@webpresso/agent-kit')
    expect(AGENT_BUNDLE.intendedHostPackage).toBe('@repo/cli')
    expect(AGENT_BUNDLE.commands.length).toBeGreaterThan(0)

    for (const command of AGENT_BUNDLE.commands) {
      expect(command.namespace).toBe('agent')
      expect(command.id.startsWith('agent ')).toBe(true)
      expect(command.replacementCommand.startsWith('webpresso agent ')).toBe(true)
    }
  })
})
