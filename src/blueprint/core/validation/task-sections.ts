/**
 * Validate per-task required sections in blueprint markdown.
 *
 * Checks (for type: blueprint only, not parent-roadmap):
 * - Each accepted task block (`#### [lane] Task X.Y:` or `#### Task X.Y:`) has **Depends:** line
 * - Each accepted task block has **Acceptance:** with at least one checkbox
 */

import type { ValidationResult } from "#core/types";

import { parseTaskBlocks } from "./task-blocks.js";

const DEPENDS_REGEX = /\*\*Depends:\*\*/;
const ACCEPTANCE_WITH_CHECKBOX_REGEX = /\*\*Acceptance(?:\s+Criteria)?:\*\*[\s\S]*?- \[[ x]\]/;

/** Extract doc type from frontmatter */
function extractDocType(markdown: string): string | null {
  const match = /^type:\s*(\S+)/m.exec(markdown);
  return match?.[1] ?? null;
}

interface TaskSectionIssue {
  taskId: string;
  missingDepends: boolean;
  missingAcceptance: boolean;
}

/** Find task blocks missing required sections */
function findTaskSectionIssues(markdown: string): TaskSectionIssue[] {
  const issues: TaskSectionIssue[] = [];

  function checkBlock(taskId: string, block: string): void {
    const missingDepends = !DEPENDS_REGEX.test(block);
    const missingAcceptance = !ACCEPTANCE_WITH_CHECKBOX_REGEX.test(block);

    if (missingDepends || missingAcceptance) {
      issues.push({ taskId, missingDepends, missingAcceptance });
    }
  }

  for (const { taskId, block } of parseTaskBlocks(markdown)) {
    checkBlock(taskId, block);
  }

  return issues;
}

/**
 * Validate per-task required sections.
 * Only validates blueprints with type: blueprint (skips parent-roadmap).
 */
export function validateTaskSections(markdown: string, docType?: string): ValidationResult {
  // Determine doc type from parameter or frontmatter
  const type = docType ?? extractDocType(markdown);

  // Only validate blueprint type documents, not parent-roadmap
  if (type !== "blueprint") {
    return { valid: true };
  }

  const issues = findTaskSectionIssues(markdown);

  if (!issues.length) {
    return { valid: true };
  }

  const errorMessages: string[] = [];
  for (const issue of issues) {
    const missing: string[] = [];
    if (issue.missingDepends) missing.push("**Depends:**");
    if (issue.missingAcceptance) missing.push("**Acceptance:** with checkbox");
    errorMessages.push(`Task ${issue.taskId} missing required sections: ${missing.join(", ")}`);
  }

  return {
    valid: false,
    error: errorMessages.join("; "),
  };
}
