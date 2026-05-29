/**
 * Plan Diff Generator
 *
 * Pure function that generates human-readable diffs between two plan states.
 * Detects changes in task status, titles, blocked reasons, and acceptance criteria.
 */
import type { Blueprint } from '#core/parser';
export interface DiffChange {
    type: string;
    description: string;
}
export interface DiffFieldChange {
    type: string;
    taskId: string;
    field: string;
    before: unknown;
    after: unknown;
}
export interface BlueprintDiff {
    added: DiffChange[];
    removed: DiffChange[];
    changed: DiffFieldChange[];
}
/**
 * Generate a human-readable diff between two plan states
 *
 * @param before - Previous plan state
 * @param after - Current plan state
 * @returns Structured diff with added, removed, and changed items
 */
export declare function generateBlueprintDiff(before: Blueprint, after: Blueprint): BlueprintDiff;
/**
 * Format a diff for human display (CLI output)
 */
export declare function formatDiffForDisplay(diff: BlueprintDiff): string;
//# sourceMappingURL=diff.d.ts.map