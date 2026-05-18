import type { Task } from './types.js';
/**
 * Parsed task from an implementation plan
 */
export interface PlanTask {
    id: string;
    title: string;
    description: string;
    type: 'lint-fix' | 'typecheck-fix' | 'test-fix' | 'implement' | 'research' | 'verify';
    package?: string;
    file?: string;
    dependsOn: string[];
    metadata?: Record<string, unknown>;
}
/**
 * Plan parsing result
 */
export interface ParsedPlan {
    title: string;
    tasks: PlanTask[];
    metadata: {
        totalTasks: number;
        maxParallelism: number;
        criticalPathLength: number;
    };
}
/**
 * Parse implementation plan markdown into structured tasks.
 *
 * Supports formats:
 * - Numbered lists with dependencies: `1. [depends: 2,3] Task description`
 * - Task blocks with metadata
 * - Checkbox lists: `- [ ] Task description`
 *
 * @example
 * ```markdown
 * # Implementation Plan
 *
 * ## Tasks
 * 1. Fix lint errors in cli2
 * 2. [depends: 1] Fix typecheck errors in cli2
 * 3. [depends: 1] Fix typecheck errors in schema-engine
 * 4. [depends: 2,3] Run full test suite
 * ```
 */
export declare function parsePlan(markdown: string): ParsedPlan;
/**
 * Convert parsed plan tasks to Task format for executor
 */
export declare function planTasksToGraphTasks(planTasks: PlanTask[]): Array<{
    task: Task<PlanTask>;
    dependsOn?: string[];
}>;
//# sourceMappingURL=plan-parser.d.ts.map