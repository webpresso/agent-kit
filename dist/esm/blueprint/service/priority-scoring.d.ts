/**
 * Priority Scoring Algorithm for Technical Debt
 *
 * Calculates a 0-100 priority score based on multiple factors:
 * - Severity (10-40 points)
 * - Staleness (0-30 points)
 * - Overdue review (0-20 points)
 * - Active blueprint link (0-10 points)
 * - Category urgency (0-5 points)
 */
import type { BlueprintRecord } from '#query/types';
import type { TechDebtRecord } from '#tech-debt/index';
/**
 * Compute priority score for a tech debt item
 *
 * @param item - The tech debt record to score
 * @param linkedBlueprints - Blueprints that reference this tech debt item
 * @returns Priority score from 0-100 (higher = more urgent)
 */
export declare function computePriorityScore(item: TechDebtRecord, linkedBlueprints: BlueprintRecord[]): number;
//# sourceMappingURL=priority-scoring.d.ts.map