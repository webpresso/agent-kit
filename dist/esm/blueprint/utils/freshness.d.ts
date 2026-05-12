/**
 * Freshness Calculator for Implementation Plans
 *
 * Calculates freshness scores using exponential decay.
 * Score = e^(-k * days), where k is calibrated so score = 0.5 at warning threshold.
 */
import type { BlueprintStatus } from '#core/schema';
export type { FreshnessScore } from '#query/types';
import type { FreshnessScore } from '#query/types';
/**
 * Calculate the freshness score for a plan.
 *
 * Uses exponential decay: score = e^(-k * days)
 * The decay constant k is calibrated so score = 0.5 at the warning threshold.
 *
 * @param lastUpdated - The date the plan was last updated
 * @param planStatus - The status of the plan (affects thresholds)
 * @returns FreshnessScore with score, days since update, and status
 */
export declare function calculateFreshness(lastUpdated: Date, planStatus: BlueprintStatus): FreshnessScore;
//# sourceMappingURL=freshness.d.ts.map