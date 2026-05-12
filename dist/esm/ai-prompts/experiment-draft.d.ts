/**
 * Experiment draft generation from analytics signals
 *
 * Converts analytics data into structured experiment drafts with
 * hypothesis, primary metric, guardrails, and rollout plan.
 */
export interface AnalyticsSignal {
    metricName: string;
    currentValue: number;
    previousValue: number;
    trend: 'improving' | 'declining' | 'stable';
    sampleSize: number;
    periodDays: number;
    metadata?: Record<string, unknown>;
}
export interface ExperimentDraftInput {
    projectId: string;
    projectName: string;
    signals: AnalyticsSignal[];
    existingFlagKeys?: string[];
}
export interface VariantDraft {
    name: string;
    description: string;
    isControl: boolean;
}
export interface GuardrailDraft {
    metricName: string;
    operator: string;
    threshold: number;
}
export interface RolloutMilestone {
    percentage: number;
    criteria: string;
}
export interface RolloutPlan {
    initialPercentage: number;
    milestones: RolloutMilestone[];
}
export interface ExperimentDraft {
    name: string;
    hypothesis: string;
    primaryMetric: string;
    guardrails: GuardrailDraft[];
    variants: VariantDraft[];
    rolloutPlan: RolloutPlan;
    rationale: string;
    confidence: number;
    estimatedImpact: string;
}
export type DraftDisposition = 'auto_queue' | 'require_approval' | 'suggest_only';
export interface ExperimentDecisionEvent {
    type: 'experiment_draft_generated';
    projectId: string;
    draftName: string;
    disposition: DraftDisposition;
    autonomyLevel: string;
    primaryMetric: string;
    confidence: number;
    timestamp: string;
    signals: Array<{
        metricName: string;
        trend: string;
        deltaPercent: number;
    }>;
}
/**
 * Compute urgency score for a signal.
 * Higher = more urgent to experiment on.
 */
export declare function computeSignalUrgency(signal: AnalyticsSignal): number;
/**
 * Select the primary signal to experiment on.
 * Prefers declining signals with largest delta.
 */
export declare function selectPrimarySignal(signals: AnalyticsSignal[]): AnalyticsSignal;
/**
 * Build the LLM prompt for experiment draft generation.
 */
export declare function buildExperimentDraftPrompt(input: ExperimentDraftInput): string;
/**
 * Parse and validate an LLM response into an ExperimentDraft.
 * Returns null if the response is invalid or incomplete.
 */
export declare function parseExperimentDraftResponse(response: string): ExperimentDraft | null;
//# sourceMappingURL=experiment-draft.d.ts.map