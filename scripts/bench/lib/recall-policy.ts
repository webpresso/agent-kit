export const RECALL_AT_5_THRESHOLD = 0.8

export type RecallThresholdResult = {
  readonly observed: number
  readonly passed: boolean
}

export function calculateRecallAt5(input: {
  readonly matchedQrels: number
  readonly qrelCount: number
}): number {
  const denominator = Math.min(5, input.qrelCount)
  return denominator > 0 ? input.matchedQrels / denominator : 0
}

export function aggregateRecallAt5(values: readonly number[]): number {
  if (values.length === 0) return 0
  const ordered = [...values]
  return ordered.reduce((sum, value) => sum + value, 0) / ordered.length
}

export function evaluateRecallAt5Threshold(value: number): RecallThresholdResult {
  return {
    observed: value,
    passed: value >= RECALL_AT_5_THRESHOLD,
  }
}
