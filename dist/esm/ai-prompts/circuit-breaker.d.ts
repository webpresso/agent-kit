import type { DebateOutcome, DebateState } from './persona-debate.js';
export interface CircuitBreakerConfig {
    maxTokensPerDebate: number;
    requireHumanReviewFor: Array<DebateOutcome['decision']>;
    similarityThreshold: number;
    minRoundsForSimilarityCheck: number;
}
export declare const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig;
export interface CircuitBreakerState {
    totalTokensUsed: number;
    roundSimilarities: number[];
    humanReviewRequired: boolean;
    breakerTripped: boolean;
    tripReason?: CircuitBreakerTripReason;
    trippedAt?: Date;
}
export type CircuitBreakerTripReason = 'max_tokens_exceeded' | 'hallucination_loop_detected' | 'human_review_required';
export declare function createCircuitBreakerState(): CircuitBreakerState;
export declare function updateTokens(state: CircuitBreakerState, inputTokens: number, outputTokens: number, config?: CircuitBreakerConfig): CircuitBreakerState;
export declare function calculateSimilarity(text1: string, text2: string): number;
export declare function checkForHallucinationLoop(state: DebateState, config?: CircuitBreakerConfig): {
    detected: boolean;
    similarity: number;
};
export declare function updateSimilarity(state: CircuitBreakerState, similarity: number, isLoop: boolean): CircuitBreakerState;
export declare function requiresHumanReview(outcome: DebateOutcome, config?: CircuitBreakerConfig): boolean;
export declare function flagForHumanReview(state: CircuitBreakerState): CircuitBreakerState;
export interface CircuitBreakerCheckResult {
    shouldContinue: boolean;
    state: CircuitBreakerState;
    message?: string;
}
export declare function checkCircuitBreaker(debateState: DebateState, breakerState: CircuitBreakerState, config?: CircuitBreakerConfig): CircuitBreakerCheckResult;
export declare function createCircuitBreakerLog(debateId: string, state: CircuitBreakerState, event: 'check' | 'trip' | 'human_review_flagged'): Record<string, unknown>;
//# sourceMappingURL=circuit-breaker.d.ts.map