/**
 * Archive Operations
 *
 * Validates that all tasks in a plan are complete and updates status in place.
 */
import type { Blueprint } from '#core/parser';
export interface IncompleteTask {
    id: string;
    title: string;
    status: string;
}
export interface ValidationResult {
    valid: boolean;
    incompleteTasks?: IncompleteTask[];
    message?: string;
}
/**
 * Validates that all tasks in a plan are complete.
 *
 * A task is considered complete when:
 * - status === 'done' or 'dropped'
 * - If status === 'done', all acceptance criteria checkboxes are checked
 *
 * @param plan - The plan to validate
 * @returns Validation result with details of incomplete tasks
 *
 * @example
 * ```typescript
 * const result = validateAllTasksDone(plan)
 * if (!result.valid) {
 *   console.error(result.message)
 *   console.log('Incomplete tasks:', result.incompleteTasks)
 * }
 * ```
 */
export declare function validateAllTasksDone(plan: Blueprint): ValidationResult;
/**
 * Result of an archive operation.
 */
export interface ArchiveResult {
    success: boolean;
    newPath?: string;
    error?: string;
}
/**
 * Archives a plan by updating its status to completed in-place.
 *
 * This function:
 * 1. Validates all tasks are done
 * 2. Updates frontmatter status to 'completed'
 * 3. Returns new path on success
 *
 * @param slug - Plan slug (e.g., 'my-plan')
 * @param projectPath - Root path of the project
 * @returns Archive result with success status and new path or error
 *
 * @example
 * ```typescript
 * const result = await archiveBlueprint('my-plan', '/path/to/project')
 * if (result.success) {
 *   console.log('Archived to:', result.newPath)
 * } else {
 *   console.error('Error:', result.error)
 * }
 * ```
 */
export declare function archiveBlueprint(slug: string, projectPath: string): Promise<ArchiveResult>;
//# sourceMappingURL=archive.d.ts.map