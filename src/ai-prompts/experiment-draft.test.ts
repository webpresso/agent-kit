import { describe, expect, it } from 'vitest'

import {
  buildExperimentDraftPrompt,
  computeSignalUrgency,
  parseExperimentDraftResponse,
  selectPrimarySignal,
  type AnalyticsSignal,
} from './experiment-draft.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const decliningSignal: AnalyticsSignal = {
  metricName: 'conversion_rate',
  currentValue: 0.032,
  previousValue: 0.045,
  trend: 'declining',
  sampleSize: 1200,
  periodDays: 14,
  metadata: { page: '/checkout' },
}

const improvingSignal: AnalyticsSignal = {
  metricName: 'bounce_rate',
  currentValue: 0.28,
  previousValue: 0.35,
  trend: 'improving',
  sampleSize: 3400,
  periodDays: 14,
}

const stableSignal: AnalyticsSignal = {
  metricName: 'p95_latency_ms',
  currentValue: 420,
  previousValue: 410,
  trend: 'stable',
  sampleSize: 8000,
  periodDays: 7,
}

// ---------------------------------------------------------------------------
// selectPrimarySignal
// ---------------------------------------------------------------------------

describe('selectPrimarySignal', () => {
  it('picks the declining signal with the largest delta', () => {
    const signals: AnalyticsSignal[] = [stableSignal, decliningSignal, improvingSignal]
    const primary = selectPrimarySignal(signals)
    expect(primary.metricName).toBe('conversion_rate')
  })

  it('prefers declining over improving', () => {
    const signals: AnalyticsSignal[] = [improvingSignal, decliningSignal]
    const primary = selectPrimarySignal(signals)
    expect(primary.trend).toBe('declining')
  })

  it('returns the signal with highest urgency when none are declining', () => {
    const signals: AnalyticsSignal[] = [stableSignal, improvingSignal]
    const primary = selectPrimarySignal(signals)
    // improving signal has larger delta
    expect(primary.metricName).toBe('bounce_rate')
  })

  it('throws when given an empty array', () => {
    expect(() => selectPrimarySignal([])).toThrow('No analytics signals provided')
  })
})

// ---------------------------------------------------------------------------
// computeSignalUrgency
// ---------------------------------------------------------------------------

describe('computeSignalUrgency', () => {
  it('scores declining signals higher than stable', () => {
    const decliningScore = computeSignalUrgency(decliningSignal)
    const stableScore = computeSignalUrgency(stableSignal)
    expect(decliningScore).toBeGreaterThan(stableScore)
  })

  it('weights larger sample sizes higher', () => {
    const small: AnalyticsSignal = {
      ...decliningSignal,
      sampleSize: 50,
    }
    const large: AnalyticsSignal = {
      ...decliningSignal,
      sampleSize: 5000,
    }
    expect(computeSignalUrgency(large)).toBeGreaterThan(computeSignalUrgency(small))
  })

  it('returns 0 for stable signals with near-zero delta', () => {
    const nearZero: AnalyticsSignal = {
      metricName: 'x',
      currentValue: 100,
      previousValue: 100,
      trend: 'stable',
      sampleSize: 1000,
      periodDays: 7,
    }
    expect(computeSignalUrgency(nearZero)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildExperimentDraftPrompt
// ---------------------------------------------------------------------------

describe('buildExperimentDraftPrompt', () => {
  it('includes all signal metrics in the prompt', () => {
    const prompt = buildExperimentDraftPrompt({
      projectId: 'proj_1',
      projectName: 'Checkout Flow',
      signals: [decliningSignal, stableSignal],
    })

    expect(prompt).toContain('conversion_rate')
    expect(prompt).toContain('p95_latency_ms')
    expect(prompt).toContain('Checkout Flow')
  })

  it('includes sample size and period information', () => {
    const prompt = buildExperimentDraftPrompt({
      projectId: 'proj_1',
      projectName: 'Test',
      signals: [decliningSignal],
    })

    expect(prompt).toContain('1200')
    expect(prompt).toContain('14')
  })

  it('marks existing flag keys in the prompt', () => {
    const prompt = buildExperimentDraftPrompt({
      projectId: 'proj_1',
      projectName: 'Test',
      signals: [decliningSignal],
      existingFlagKeys: ['checkout-v2', 'pricing-page'],
    })

    expect(prompt).toContain('checkout-v2')
    expect(prompt).toContain('pricing-page')
  })

  it('requests JSON output with required fields', () => {
    const prompt = buildExperimentDraftPrompt({
      projectId: 'proj_1',
      projectName: 'Test',
      signals: [decliningSignal],
    })

    expect(prompt).toContain('hypothesis')
    expect(prompt).toContain('primaryMetric')
    expect(prompt).toContain('guardrails')
    expect(prompt).toContain('variants')
    expect(prompt).toContain('rolloutPlan')
  })
})

// ---------------------------------------------------------------------------
// parseExperimentDraftResponse
// ---------------------------------------------------------------------------

describe('parseExperimentDraftResponse', () => {
  const validResponse = JSON.stringify({
    name: 'Checkout CTA Color Test',
    hypothesis:
      'Changing the CTA button color to green will increase conversion rate by reducing friction at checkout.',
    primaryMetric: 'conversion_rate',
    guardrails: [{ metricName: 'error_rate', operator: 'lt', threshold: 0.05 }],
    variants: [
      { name: 'control', description: 'Current blue CTA', isControl: true },
      { name: 'green_cta', description: 'Green CTA button', isControl: false },
    ],
    rolloutPlan: {
      initialPercentage: 10,
      milestones: [
        { percentage: 25, criteria: 'No guardrail violations after 48h' },
        { percentage: 50, criteria: 'Conversion rate improved or neutral after 7 days' },
      ],
    },
    rationale: 'Conversion rate declined 28% over 14 days with strong sample size.',
    confidence: 0.75,
    estimatedImpact: '+15-25% conversion rate recovery',
  })

  it('parses a valid JSON response into an ExperimentDraft', () => {
    const draft = parseExperimentDraftResponse(validResponse)
    expect(draft).not.toBeNull()
    expect(draft!.name).toBe('Checkout CTA Color Test')
    expect(draft!.primaryMetric).toBe('conversion_rate')
    expect(draft!.variants).toHaveLength(2)
    expect(draft!.guardrails).toHaveLength(1)
  })

  it('extracts JSON from markdown code fences', () => {
    const fenced = `\`\`\`json\n${validResponse}\n\`\`\``
    const draft = parseExperimentDraftResponse(fenced)
    expect(draft).not.toBeNull()
    expect(draft!.hypothesis).toContain('CTA button color')
  })

  it('returns null for invalid JSON', () => {
    expect(parseExperimentDraftResponse('not json')).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    const partial = JSON.stringify({ name: 'test', hypothesis: 'something' })
    expect(parseExperimentDraftResponse(partial)).toBeNull()
  })

  it('returns null when variants lack a control', () => {
    const noControl = JSON.stringify({
      name: 'test',
      hypothesis: 'test hypothesis',
      primaryMetric: 'm',
      guardrails: [],
      variants: [{ name: 'v1', description: 'd', isControl: false }],
      rolloutPlan: { initialPercentage: 10, milestones: [] },
    })
    expect(parseExperimentDraftResponse(noControl)).toBeNull()
  })

  it('normalizes guardrail operators', () => {
    const upperOp = JSON.stringify({
      name: 'test',
      hypothesis: 'test hypothesis for this experiment',
      primaryMetric: 'error_rate',
      guardrails: [{ metricName: 'error_rate', operator: 'LT', threshold: 0.05 }],
      variants: [{ name: 'control', description: 'd', isControl: true }],
      rolloutPlan: { initialPercentage: 10, milestones: [] },
    })
    const draft = parseExperimentDraftResponse(upperOp)
    expect(draft).not.toBeNull()
    expect(draft!.guardrails[0]!.operator).toBe('lt')
  })

  it('clamps confidence to 0-1 range', () => {
    const overConfident = JSON.stringify({
      name: 'test',
      hypothesis: 'test hypothesis for this experiment',
      primaryMetric: 'm',
      guardrails: [],
      variants: [{ name: 'control', description: 'd', isControl: true }],
      rolloutPlan: { initialPercentage: 10, milestones: [] },
      confidence: 1.5,
    })
    const draft = parseExperimentDraftResponse(overConfident)
    expect(draft).not.toBeNull()
    expect(draft!.confidence).toBe(1)
  })
})
