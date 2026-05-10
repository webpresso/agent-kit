/**
 * Experiment draft generation from analytics signals
 *
 * Converts analytics data into structured experiment drafts with
 * hypothesis, primary metric, guardrails, and rollout plan.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyticsSignal {
  metricName: string
  currentValue: number
  previousValue: number
  trend: 'improving' | 'declining' | 'stable'
  sampleSize: number
  periodDays: number
  metadata?: Record<string, unknown>
}

export interface ExperimentDraftInput {
  projectId: string
  projectName: string
  signals: AnalyticsSignal[]
  existingFlagKeys?: string[]
}

export interface VariantDraft {
  name: string
  description: string
  isControl: boolean
}

export interface GuardrailDraft {
  metricName: string
  operator: string
  threshold: number
}

export interface RolloutMilestone {
  percentage: number
  criteria: string
}

export interface RolloutPlan {
  initialPercentage: number
  milestones: RolloutMilestone[]
}

export interface ExperimentDraft {
  name: string
  hypothesis: string
  primaryMetric: string
  guardrails: GuardrailDraft[]
  variants: VariantDraft[]
  rolloutPlan: RolloutPlan
  rationale: string
  confidence: number
  estimatedImpact: string
}

export type DraftDisposition = 'auto_queue' | 'require_approval' | 'suggest_only'

export interface ExperimentDecisionEvent {
  type: 'experiment_draft_generated'
  projectId: string
  draftName: string
  disposition: DraftDisposition
  autonomyLevel: string
  primaryMetric: string
  confidence: number
  timestamp: string
  signals: Array<{
    metricName: string
    trend: string
    deltaPercent: number
  }>
}

// ---------------------------------------------------------------------------
// Signal analysis
// ---------------------------------------------------------------------------

/**
 * Compute urgency score for a signal.
 * Higher = more urgent to experiment on.
 */
export function computeSignalUrgency(signal: AnalyticsSignal): number {
  if (signal.previousValue === 0 && signal.currentValue === 0) return 0

  const deltaPercent = Math.abs(
    (signal.currentValue - signal.previousValue) /
      Math.max(Math.abs(signal.previousValue), Number.EPSILON),
  )

  const trendMultiplier =
    signal.trend === 'declining' ? 2 : signal.trend === 'improving' ? 0.5 : 0.1
  const sampleConfidence = Math.min(signal.sampleSize / 1000, 1)

  return deltaPercent * trendMultiplier * sampleConfidence
}

/**
 * Select the primary signal to experiment on.
 * Prefers declining signals with largest delta.
 */
export function selectPrimarySignal(signals: AnalyticsSignal[]): AnalyticsSignal {
  if (signals.length === 0) {
    throw new Error('No analytics signals provided')
  }

  const scored = signals
    .map((s) => ({ signal: s, score: computeSignalUrgency(s) }))
    .toSorted((a, b) => b.score - a.score)

  return scored[0]!.signal
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

/**
 * Build the LLM prompt for experiment draft generation.
 */
export function buildExperimentDraftPrompt(input: ExperimentDraftInput): string {
  const primary = selectPrimarySignal(input.signals)

  const signalDescriptions = input.signals
    .map((s) => {
      const delta =
        s.previousValue !== 0
          ? (((s.currentValue - s.previousValue) / Math.abs(s.previousValue)) * 100).toFixed(1)
          : 'N/A'
      return `- ${s.metricName}: ${s.currentValue} (was ${s.previousValue}, ${delta}% change, trend: ${s.trend}, sample: ${s.sampleSize} over ${s.periodDays} days)`
    })
    .join('\n')

  const existingFlagsSection =
    input.existingFlagKeys && input.existingFlagKeys.length > 0
      ? `\n<existing_flags>\n${input.existingFlagKeys.join(', ')}\n</existing_flags>\nDo NOT propose experiments for these existing flag keys.`
      : ''

  return `You are an experimentation engineer analyzing analytics signals for project "${input.projectName}".

<analytics_signals>
${signalDescriptions}
</analytics_signals>

Primary concern: ${primary.metricName} (trend: ${primary.trend}, sample: ${primary.sampleSize})
${existingFlagsSection}

<instructions>
Based on these analytics signals, propose a concrete experiment draft. The experiment should:
1. Address the most impactful signal (especially declining metrics)
2. Have a clear, testable hypothesis
3. Define primary metric and guardrails
4. Include a safe rollout plan with milestones
5. Estimate confidence and expected impact

Respond in JSON format only:
{
  "name": "Short experiment name",
  "hypothesis": "If we [change], then [metric] will [improve] because [reasoning]",
  "primaryMetric": "metric_name",
  "guardrails": [
    { "metricName": "error_rate", "operator": "lt", "threshold": 0.05 }
  ],
  "variants": [
    { "name": "control", "description": "Current behavior", "isControl": true },
    { "name": "treatment", "description": "Proposed change", "isControl": false }
  ],
  "rolloutPlan": {
    "initialPercentage": 10,
    "milestones": [
      { "percentage": 25, "criteria": "No guardrail violations after 48h" },
      { "percentage": 50, "criteria": "Primary metric shows improvement after 7 days" }
    ]
  },
  "rationale": "Why this experiment is worth running",
  "confidence": 0.75,
  "estimatedImpact": "Expected impact range on the primary metric"
}
</instructions>`
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

const VALID_OPERATORS = new Set(['lt', 'lte', 'gt', 'gte'])

interface RawDraft {
  name?: unknown
  hypothesis?: unknown
  primaryMetric?: unknown
  guardrails?: unknown
  variants?: unknown
  rolloutPlan?: unknown
  rationale?: unknown
  confidence?: unknown
  estimatedImpact?: unknown
}

/**
 * Parse and validate an LLM response into an ExperimentDraft.
 * Returns null if the response is invalid or incomplete.
 */
export function parseExperimentDraftResponse(response: string): ExperimentDraft | null {
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch?.[1]?.trim() ?? response.trim()

  let parsed: RawDraft
  try {
    parsed = JSON.parse(jsonStr) as RawDraft
  } catch {
    return null
  }

  if (!parsed.name || typeof parsed.name !== 'string') return null
  if (!parsed.hypothesis || typeof parsed.hypothesis !== 'string') return null
  if (!parsed.primaryMetric || typeof parsed.primaryMetric !== 'string') return null

  // Validate variants
  if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) return null
  const variants: VariantDraft[] = []
  for (const v of parsed.variants) {
    if (!v || typeof v !== 'object') return null
    const obj = v as Record<string, unknown>
    if (
      typeof obj.name !== 'string' ||
      typeof obj.description !== 'string' ||
      typeof obj.isControl !== 'boolean'
    ) {
      return null
    }
    variants.push({ name: obj.name, description: obj.description, isControl: obj.isControl })
  }

  const hasControl = variants.some((v) => v.isControl)
  if (!hasControl) return null

  // Validate guardrails
  const guardrails: GuardrailDraft[] = []
  if (Array.isArray(parsed.guardrails)) {
    for (const g of parsed.guardrails) {
      if (!g || typeof g !== 'object') continue
      const obj = g as Record<string, unknown>
      if (
        typeof obj.metricName !== 'string' ||
        typeof obj.operator !== 'string' ||
        typeof obj.threshold !== 'number'
      ) {
        continue
      }
      const operator = obj.operator.toLowerCase()
      if (!VALID_OPERATORS.has(operator)) continue
      guardrails.push({ metricName: obj.metricName, operator, threshold: obj.threshold })
    }
  }

  // Validate rollout plan
  const rawPlan = parsed.rolloutPlan as Record<string, unknown> | undefined
  const initialPercentage =
    typeof rawPlan?.initialPercentage === 'number'
      ? Math.max(1, Math.min(100, rawPlan.initialPercentage))
      : 10

  const milestones: RolloutMilestone[] = []
  if (Array.isArray(rawPlan?.milestones)) {
    for (const m of rawPlan.milestones) {
      if (!m || typeof m !== 'object') continue
      const obj = m as Record<string, unknown>
      if (typeof obj.percentage === 'number' && typeof obj.criteria === 'string') {
        milestones.push({ percentage: obj.percentage, criteria: obj.criteria })
      }
    }
  }

  // Clamp confidence
  let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
  confidence = Math.max(0, Math.min(1, confidence))

  return {
    name: parsed.name,
    hypothesis: parsed.hypothesis,
    primaryMetric: parsed.primaryMetric,
    guardrails,
    variants,
    rolloutPlan: { initialPercentage, milestones },
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
    confidence,
    estimatedImpact:
      typeof parsed.estimatedImpact === 'string' ? parsed.estimatedImpact : 'Unknown',
  }
}
