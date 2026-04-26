import type { DevRoutingDecision } from './dev-routing.js'

export function formatRoutingDecision(decision: DevRoutingDecision | null): string {
  if (decision === null) return '{}'

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: decision.guidance,
    },
  })
}
