import { describe, expect, it } from 'vitest'

import { formatRoutingDecision } from './routing-formatter.js'
import type { DevRoutingDecision } from './dev-routing.js'

describe('formatRoutingDecision', () => {
  it('null → "{}"', () => {
    expect(formatRoutingDecision(null)).toBe('{}')
  })

  it('deny → valid JSON with permissionDecision: "deny" and permissionDecisionReason equal to guidance', () => {
    const decision: DevRoutingDecision = {
      action: 'deny',
      guidance: 'Use ak_test MCP tool instead — returns {passed, summary} not raw logs',
    }
    const output = formatRoutingDecision(decision)
    const parsed = JSON.parse(output) as {
      hookSpecificOutput: {
        hookEventName: string
        permissionDecision: string
        permissionDecisionReason: string
      }
    }
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBe(decision.guidance)
  })

  it('output always parses with JSON.parse without throwing', () => {
    const cases: Array<DevRoutingDecision | null> = [
      null,
      { action: 'deny', guidance: 'Use ak_lint MCP tool instead — returns {passed, violations[]}' },
      { action: 'deny', guidance: 'Use ak_qa MCP tool instead — runs lint+typecheck+test and returns combined summary' },
    ]
    for (const decision of cases) {
      expect(() => JSON.parse(formatRoutingDecision(decision))).not.toThrow()
    }
  })
})
