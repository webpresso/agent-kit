/**
 * Validate task dependency graph in blueprint markdown.
 *
 * Checks:
 * - No dangling dependency references (Task X.Y that doesn't exist)
 * - No circular dependencies (A → B → A)
 */
import type { ValidationResult } from '#core/types';
export interface DependencyValidationResult extends ValidationResult {
    details?: {
        cycles?: string[];
        danglingRefs?: string[];
    };
}
/**
 * Validate task dependency graph in blueprint markdown.
 */
export declare function validateTaskDependencies(markdown: string): DependencyValidationResult;
//# sourceMappingURL=dependencies.d.ts.map