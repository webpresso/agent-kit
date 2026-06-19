import { describe, expect, it } from 'vitest'

import { classifyCardMetric, classifyClaimLine, METRIC_CLASSES } from './claim-class'

describe('METRIC_CLASSES', () => {
  it('pins the complete ordered set of metric classes', () => {
    expect(METRIC_CLASSES).toStrictEqual([
      'byte_proxy',
      'provider_tokens_cost',
      'recall',
      'hook_latency',
      'native_speedup',
      'replacement_parity',
      'rtk_context_mode',
    ])
  })
})

describe('classifyClaimLine', () => {
  it('classifies provider_tokens_cost for "99% token savings"', () => {
    expect(classifyClaimLine('99% token savings')).toContain('provider_tokens_cost')
  })

  it('classifies byte_proxy for "gainBytes: 12345"', () => {
    expect(classifyClaimLine('gainBytes: 12345')).toContain('byte_proxy')
  })

  it('classifies recall for "recall@5: 0.85"', () => {
    expect(classifyClaimLine('recall@5: 0.85')).toContain('recall')
  })

  it('classifies hook_latency for "hook latency 120ms"', () => {
    expect(classifyClaimLine('hook latency 120ms')).toContain('hook_latency')
  })

  it('does NOT classify hook_latency for "wall time 2.3s"', () => {
    expect(classifyClaimLine('wall time 2.3s')).not.toContain('hook_latency')
  })

  it('classifies native_speedup for "native speedup 3.2x"', () => {
    expect(classifyClaimLine('native speedup 3.2x')).toContain('native_speedup')
  })

  it('classifies replacement_parity for "drop-in replacement"', () => {
    expect(classifyClaimLine('drop-in replacement')).toContain('replacement_parity')
  })

  it('classifies rtk_context_mode for "RTK context mode"', () => {
    expect(classifyClaimLine('RTK context mode')).toContain('rtk_context_mode')
  })

  it('does NOT classify hook_latency for "faster and cheaper"', () => {
    expect(classifyClaimLine('faster and cheaper')).not.toContain('hook_latency')
  })

  it('returns empty array for unrecognized text', () => {
    expect(classifyClaimLine('completely unrelated text')).toStrictEqual([])
  })

  it('can classify multiple classes from a single line', () => {
    const result = classifyClaimLine('99% token savings with gainBytes reduction')
    expect(result).toContain('provider_tokens_cost')
    expect(result).toContain('byte_proxy')
  })
})

describe('classifyCardMetric', () => {
  it('classifies approxTokensSaved as byte_proxy', () => {
    expect(classifyCardMetric({ name: 'approxTokensSaved', value: 1234 })).toStrictEqual(
      'byte_proxy',
    )
  })

  it('classifies hookLatencyMs as hook_latency', () => {
    expect(classifyCardMetric({ name: 'hookLatencyMs', value: 150 })).toStrictEqual('hook_latency')
  })

  it('byte_proxy class is different from provider_tokens_cost class', () => {
    const byteProxyClass = classifyCardMetric({ name: 'approxTokensSaved', value: 1234 })
    const providerCostClass = classifyCardMetric({ name: 'tokensSaved', value: 99 })
    expect(byteProxyClass).not.toStrictEqual(providerCostClass)
  })

  it('defaults to byte_proxy for unrecognized metric names', () => {
    expect(classifyCardMetric({ name: 'unknownMetric', value: 42 })).toStrictEqual('byte_proxy')
  })

  it('classifies recall-related metric', () => {
    expect(classifyCardMetric({ name: 'recallAtFive', value: 0.85 })).toStrictEqual('recall')
  })

  it('classifies nativeSpeedup metric', () => {
    expect(classifyCardMetric({ name: 'nativeSpeedup', value: 3.2 })).toStrictEqual('native_speedup')
  })
})
