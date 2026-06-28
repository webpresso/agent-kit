/**
 * Validate per-task required sections in blueprint markdown.
 *
 * Checks (for type: blueprint only, not parent-roadmap):
 * - Each accepted task block (`#### [lane] Task X.Y:` or `#### Task X.Y:`) has **Depends:** line
 * - Each accepted task block has **Acceptance:** with at least one checkbox
 */
import type { ValidationResult } from "#core/types";
/**
 * Validate per-task required sections.
 * Only validates blueprints with type: blueprint (skips parent-roadmap).
 */
export declare function validateTaskSections(markdown: string, docType?: string): ValidationResult;
//# sourceMappingURL=task-sections.d.ts.map