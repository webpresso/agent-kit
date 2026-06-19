export type PhaseStatus = 'PASS' | 'FAIL' | 'BLOCKED'

export interface PhaseResult {
  readonly phase: string
  readonly status: PhaseStatus
  readonly durationMs: number
  readonly capturedOutput: string
  readonly blockReason?: string
}

export interface PhaseSummary {
  readonly phases: readonly PhaseResult[]
  readonly overall: PhaseStatus
}

export function computeOverallStatus(phases: readonly PhaseResult[]): PhaseStatus {
  if (phases.some((p) => p.status === 'FAIL')) return 'FAIL'
  if (phases.some((p) => p.status === 'BLOCKED')) return 'BLOCKED'
  return 'PASS'
}

export function summarizePhases(phases: readonly PhaseResult[]): PhaseSummary {
  return { phases, overall: computeOverallStatus(phases) }
}
