/**
 * Tracked Document Parser Utilities
 *
 * Pure functions for parsing markdown documents with checkbox-based task tracking.
 * Shared across Blueprint and TechDebt parsers.
 *
 * Git-Native SSoT: Checkbox state derives status, no external state.
 */
import type { BlueprintTaskStatus } from "#core/schema";
/**
 * Checkbox status with derived task state
 */
export interface CheckboxStatus {
    total: number;
    checked: number;
    status: BlueprintTaskStatus;
}
/**
 * Acceptance criteria tracking
 */
export interface AcceptanceCriteria {
    total: number;
    checked: number;
}
/**
 * Extract checkbox status from a markdown section and derive task state.
 *
 * Status derivation rules (Git-Native SSoT):
 * - 0 checkboxes = pending (no acceptance criteria defined yet)
 * - all checked = completed
 * - some checked = running
 * - none checked = pending
 *
 * @param section - Markdown section containing checkboxes
 * @returns Checkbox counts and derived status
 *
 * @example
 * ```typescript
 * const section = `
 * #### Task 1.1: Setup
 * - [x] Install dependencies
 * - [ ] Configure environment
 * `
 * const { total, checked, status } = extractCheckboxStatus(section)
 * // { total: 2, checked: 1, status: 'running' }
 * ```
 */
export declare function extractCheckboxStatus(section: string): CheckboxStatus;
/**
 * Extract acceptance criteria (checkbox counts only, without status)
 *
 * @param section - Markdown section containing checkboxes
 * @returns Checkbox counts
 */
export declare function extractAcceptanceCriteria(section: string): AcceptanceCriteria;
/**
 * Extract dependency task IDs from a "Depends:" metadata line
 *
 * Supports multiple formats:
 * - "Task 1.1, Task 1.2" (explicit prefix each)
 * - "Tasks 1.1, 1.2, 1.3" (plural prefix, bare IDs after)
 * - "1.1, 1.2" (bare IDs)
 * - "None" (returns empty array)
 *
 * @param section - Markdown section containing metadata
 * @returns Array of task IDs (e.g., ["1.1", "1.2"])
 *
 * @example
 * ```typescript
 * const section = "**Depends:** Tasks 1.1, 1.2"
 * extractDepends(section) // ["1.1", "1.2"]
 * ```
 */
export declare function extractDepends(section: string): string[];
/**
 * Extract blocked reason from a "Blocked:" metadata line
 *
 * @param section - Markdown section containing metadata
 * @returns Blocked reason text, or undefined if not blocked
 *
 * @example
 * ```typescript
 * const section = "**Blocked:** Waiting for API approval"
 * extractBlocked(section) // "Waiting for API approval"
 * ```
 */
export declare function extractBlocked(section: string): string | undefined;
/**
 * Find the end index of a task section.
 *
 * Task section ends at the next task header OR at a major section delimiter (## or ---).
 * This prevents including checkboxes from other sections like Success Criteria.
 *
 * @param content - Full markdown content
 * @param taskStart - Start index of current task
 * @param nextTaskIndex - Start index of next task (or content.length)
 * @returns End index of task section
 */
export declare function findTaskSectionEnd(content: string, taskStart: number, nextTaskIndex: number): number;
/**
 * Extract plain text description from a task section.
 *
 * Excludes:
 * - Task header line
 * - Metadata lines (Depends, Blocked, Status)
 * - Checklist items
 * - Leading empty lines
 *
 * @param section - Task section content
 * @returns Description text, or undefined if no description
 */
export declare function extractTaskDescription(section: string): string | undefined;
//# sourceMappingURL=parser.d.ts.map