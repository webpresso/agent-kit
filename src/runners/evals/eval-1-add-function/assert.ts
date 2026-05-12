import type { RunnerEvent } from '../../types.js'

// ---------------------------------------------------------------------------
// assertEval1 — verifies the add-function eval outcome
//
// Checks:
//   1. Has a 'completed' event with exitCode 0
//   2. At least one stdout/progress event mentioning 'add'
// ---------------------------------------------------------------------------

export interface AssertResult {
  readonly passed: boolean
  readonly reason?: string
}

export async function assertEval1(events: readonly RunnerEvent[]): Promise<AssertResult> {
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

  const mentionsAdd = events.some((e) => {
    if (e.type === 'stdout') {
      return e.line.toLowerCase().includes('add')
    }
    if (e.type === 'progress') {
      return e.message.toLowerCase().includes('add')
    }
    return false
  })

  if (!mentionsAdd) {
    return {
      passed: false,
      reason: "no stdout or progress event mentions 'add'",
    }
  }

  return { passed: true }
}
