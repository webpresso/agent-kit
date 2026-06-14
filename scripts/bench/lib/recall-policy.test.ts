import { describe, expect, it } from 'vitest'

import { aggregateRecallAt5, calculateRecallAt5, evaluateRecallAt5Threshold } from './recall-policy'

describe('recall policy', () => {
  it('compares exact fixed-suite recall@5 thresholds without rounding or epsilon', () => {
    expect(
      evaluateRecallAt5Threshold(calculateRecallAt5({ matchedQrels: 4, qrelCount: 5 })),
    ).toStrictEqual({
      observed: 0.8,
      passed: true,
    })
    expect(
      evaluateRecallAt5Threshold(calculateRecallAt5({ matchedQrels: 3, qrelCount: 5 })),
    ).toStrictEqual({
      observed: 0.6,
      passed: false,
    })
  })

  it('uses raw aggregate means for tier-2 cell boundaries', () => {
    expect(evaluateRecallAt5Threshold(aggregateRecallAt5([0.8, 0.8]))).toStrictEqual({
      observed: 0.8,
      passed: true,
    })
    expect(evaluateRecallAt5Threshold(aggregateRecallAt5([0.8, 0.7999992]))).toStrictEqual({
      observed: 0.7999996,
      passed: false,
    })
  })

  it('keeps empty denominator and empty aggregates fail-closed at zero', () => {
    expect(calculateRecallAt5({ matchedQrels: 0, qrelCount: 0 })).toBe(0)
    expect(aggregateRecallAt5([])).toBe(0)
    expect(evaluateRecallAt5Threshold(aggregateRecallAt5([]))).toStrictEqual({
      observed: 0,
      passed: false,
    })
  })
})
