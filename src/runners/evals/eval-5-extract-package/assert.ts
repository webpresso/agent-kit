import type { RunnerEvent } from '#runners/types'

// ---------------------------------------------------------------------------
// assertEval5 — verifies the extract-package eval outcome
//
// Checks:
//   1. Has a 'completed' event with exitCode 0
//   2. At least one stdout/progress event mentioning 'byte', 'identity',
//      'parity', or 'extract' (signals extraction verification was performed)
//   3. No stdout/progress event mentioning 'FAIL' or 'mismatch'
//      (signals byte-identity failure was detected)
//
// The extra keyword check reflects that extract-package is more complex than
// simple code-generation evals: the agent must perform a parity verification
// step (diff -ru + mutation score check) and report it. The mismatch/FAIL
// guard catches regressions where the agent ran the check but found drift.
// ---------------------------------------------------------------------------

export interface AssertResult {
  readonly passed: boolean
  readonly reason?: string
}

export async function assertEval5(events: readonly RunnerEvent[]): Promise<AssertResult> {
  const completedEvent = events.find(
    (e): e is Extract<RunnerEvent, { type: 'completed' }> => e.type === 'completed',
  )

  if (completedEvent === undefined) {
    return { passed: false, reason: "no 'completed' event found in event stream" }
  }

  if (completedEvent.exitCode !== 0) {
    return {
      passed: false,
      reason: `'completed' event has exitCode ${completedEvent.exitCode}, expected 0`,
    }
  }

  // Check for byte-identity failure markers before checking for success keywords.
  // A 'FAIL' or 'mismatch' in the output means the extraction had drift — even if
  // exitCode is 0, the parity check failed and the eval must not pass.
  const hasByteIdentityFailure = events.some((e) => {
    if (e.type === 'stdout') {
      const line = e.line
      return line.includes('FAIL') || line.includes('mismatch')
    }
    if (e.type === 'progress') {
      const msg = e.message
      return msg.includes('FAIL') || msg.includes('mismatch')
    }
    return false
  })

  if (hasByteIdentityFailure) {
    return {
      passed: false,
      reason: "stdout or progress event reports a byte-identity failure ('FAIL' or 'mismatch')",
    }
  }

  // Require evidence that parity verification was actually performed.
  const mentionsParity = events.some((e) => {
    if (e.type === 'stdout') {
      const line = e.line.toLowerCase()
      return (
        line.includes('byte') ||
        line.includes('identity') ||
        line.includes('parity') ||
        line.includes('extract')
      )
    }
    if (e.type === 'progress') {
      const msg = e.message.toLowerCase()
      return (
        msg.includes('byte') ||
        msg.includes('identity') ||
        msg.includes('parity') ||
        msg.includes('extract')
      )
    }
    return false
  })

  if (!mentionsParity) {
    return {
      passed: false,
      reason:
        "no stdout or progress event mentions 'byte', 'identity', 'parity', or 'extract' — parity verification not evidenced",
    }
  }

  return { passed: true }
}
