import type { RunnerEvent } from '#runners/types'

// ---------------------------------------------------------------------------
// assertEval2 — verifies the multi-file-refactor eval outcome
//
// Checks:
//   1. Has a 'completed' event with exitCode 0
//   2. At least one stdout/progress event mentioning 'clamp' or 'extract'
// ---------------------------------------------------------------------------

export interface AssertResult {
  readonly passed: boolean
  readonly reason?: string
}

export async function assertEval2(events: readonly RunnerEvent[]): Promise<AssertResult> {
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

  const mentionsClampOrExtract = events.some((e) => {
    if (e.type === 'stdout') {
      const lower = e.line.toLowerCase()
      return lower.includes('clamp') || lower.includes('extract')
    }
    if (e.type === 'progress') {
      const lower = e.message.toLowerCase()
      return lower.includes('clamp') || lower.includes('extract')
    }
    return false
  })

  if (!mentionsClampOrExtract) {
    return {
      passed: false,
      reason: "no stdout or progress event mentions 'clamp' or 'extract'",
    }
  }

  return { passed: true }
}
