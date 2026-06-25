import type { ValidationError } from "./types.js";

/**
 * Blueprint Plan Format Validator
 *
 * Validates that implementation plans follow the Blueprint (Distributed Parallel Reproducible Execution) format.
 * See: docs/templates/blueprint.md for specification.
 *
 * Rules enforced:
 * 1. Tasks must use #### (4 hashes), not ### (3 hashes)
 * 2. Task IDs must follow numeric X.Y format
 * 3. Dependencies must use "Task X.Y" format, not bare "X.Y"
 * 4. Executable blueprints must use canonical lifecycle statuses only
 * 5. Every executable task must include explicit **Status:**
 */

const TASK_ID_SOURCE = String.raw`\d+(?:\.\d+)+(?:[a-z])?`;
const TASK_ID_REGEX = new RegExp(`^${TASK_ID_SOURCE}$`);
const THREE_HASH_TASK_HEADER_REGEX = new RegExp(
  String.raw`^###\s+(?:\[[^\]]+\]\s+)?Task\s+(${TASK_ID_SOURCE}):`,
  "gm",
);
const THREE_HASH_TASK_HEADER_LINE_REGEX = new RegExp(
  String.raw`^###\s+(?:\[[^\]]+\]\s+)?Task\s+${TASK_ID_SOURCE}:`,
);
const FOUR_HASH_TASK_BLOCK_REGEX = new RegExp(
  String.raw`^####\s+(?:\[[^\]]+\]\s+)?Task\s+(${TASK_ID_SOURCE})\s*:\s*(.+)$`,
  "gm",
);

const EXECUTABLE_BLUEPRINT_STATUSES = new Set([
  "draft",
  "planned",
  "parked",
  "in-progress",
  "completed",
  "archived",
]);
const TASK_STATUSES = new Set(["todo", "in-progress", "blocked", "done", "dropped"]);

/**
 * Result of finding wrong task headers.
 */
interface WrongTaskHeaderResult {
  count: number;
  firstLineNumber: number | null;
}

/**
 * Find tasks using ### (3 hashes) instead of #### (4 hashes).
 * Exported for testability.
 */
export function findWrongTaskHeaders(content: string): WrongTaskHeaderResult {
  const wrongHeaderMatches = content.match(THREE_HASH_TASK_HEADER_REGEX);

  if (!wrongHeaderMatches || !wrongHeaderMatches.length) {
    return { count: 0, firstLineNumber: null };
  }

  // Find line number of first occurrence
  const lines = content.split("\n");
  const firstLineNumber =
    lines.findIndex((line) => THREE_HASH_TASK_HEADER_LINE_REGEX.test(line)) + 1;

  return {
    count: wrongHeaderMatches.length,
    firstLineNumber: firstLineNumber || null,
  };
}

/**
 * Find malformed task IDs (#### Task without X.Y format).
 * Exported for testability.
 */
export function findMalformedTaskIds(content: string): number {
  const taskHeaderMatches = content.matchAll(
    /^####\s+(?:\[[^\]]+\]\s+)?Task\s+([^:\s]+(?:\.[^:\s]+)*)\s*:/gm,
  );

  let malformedCount = 0;
  for (const match of taskHeaderMatches) {
    const taskId = match[1]?.trim();
    if (!taskId || !TASK_ID_REGEX.test(taskId)) {
      malformedCount += 1;
    }
  }

  return malformedCount;
}

/**
 * Result of checking dependency format.
 */
interface DependencyCheckResult {
  hasBareReferences: boolean;
  exampleLine: string | null;
}

/**
 * Check if dependencies use bare "X.Y" instead of "Task X.Y".
 * Exported for testability.
 */
export function checkDependencyFormat(content: string): DependencyCheckResult {
  const dependsLines = content.match(/\*\*Depends:\*\*\s*(.+)/gi) || [];

  for (const line of dependsLines) {
    const dependsContent = line.replace(/\*\*Depends:\*\*\s*/i, "").trim();

    // Skip "None" or empty
    if (dependsContent.toLowerCase() === "none" || dependsContent === "") {
      continue;
    }

    // Match bare task IDs not preceded by "Task "
    // Uses negative lookbehind to exclude "Task 1.1" or "Task 1.0.1" but match "1.1" or "1.0.1"
    // Supports both 2-level (X.Y) and 3-level (X.Y.Z) task IDs
    // Must not be preceded by a digit to avoid matching "0.1" in "1.0.1" or "Task 1.0.1"
    const bareNumberPattern = /(?<![Tt]ask\s)(?<!\d\.)(\d+\.\d+(?:\.\d+)*(?:[a-z])?)\b/g;
    if (bareNumberPattern.test(dependsContent)) {
      return {
        hasBareReferences: true,
        exampleLine: dependsContent,
      };
    }
  }

  return {
    hasBareReferences: false,
    exampleLine: null,
  };
}

/**
 * Extract frontmatter from document content.
 * Exported for testability.
 */
export function extractFrontmatter(content: string): Record<string, string> | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch || !frontmatterMatch[1]) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];
  const result: Record<string, string> = {};

  // Parse YAML-like key-value pairs
  const lines = frontmatter.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match?.[1] && match[2]) {
      const key = match[1];
      const value = match[2].trim();
      result[key] = value;
    }
  }

  return result;
}

/**
 * Detect if plan is completed based on frontmatter and file path.
 * Exported for testability.
 */
export function isCompleted(filePath: string, content: string): boolean {
  // Priority 1: Check frontmatter status
  const frontmatter = extractFrontmatter(content);
  if (frontmatter?.status) {
    const status = frontmatter.status.toLowerCase().trim();
    return status === "completed";
  }

  // Priority 2: Check if file path contains /completed/
  return filePath.includes("/completed/");
}

function extractTaskBlocks(content: string): Array<{ id: string; section: string }> {
  const matches = Array.from(content.matchAll(FOUR_HASH_TASK_BLOCK_REGEX));
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    let next = matches[index + 1]?.index ?? content.length;
    // Final task: slice stops at EOF today, which incorrectly absorbs global `## ...` sections
    // (Critical Files, Verification, Zero-Defect, Completion Summary). Truncate at first H2.
    if (next === content.length) {
      const tail = content.slice(start);
      const globalH2 = tail.search(/\n## [^#\s]/);
      if (globalH2 !== -1) {
        next = start + globalH2;
      }
    }
    return {
      id: match[1] ?? "",
      section: content.slice(start, next),
    };
  });
}

/**
 * Extract complexity from frontmatter, defaulting to 'M'.
 * Exported for testability.
 */
export function extractComplexity(content: string): string {
  const frontmatter = extractFrontmatter(content);
  if (frontmatter?.complexity) {
    return frontmatter.complexity.toUpperCase().trim();
  }
  return "M"; // Default to M
}

/**
 * Check if Completion Summary section exists.
 * Exported for testability.
 */
export function hasCompletionSummary(content: string): boolean {
  const pattern = /^## Completion Summary\s*$/m;
  return pattern.test(content);
}

/**
 * Extract Lessons Learned content from document.
 * Returns null if section not found, otherwise returns content after heading.
 * Exported for testability.
 */
export function extractLessonsLearnedContent(content: string): string | null {
  const pattern = /^### Lessons Learned\s*$/m;
  const match = content.match(pattern);

  if (!match || match.index === undefined) {
    return null;
  }

  const startIndex = match.index + match[0].length;

  // Extract content until next heading (###, ##, #) or end of file
  const afterHeading = content.slice(startIndex);
  const nextHeadingMatch = afterHeading.match(/^#{1,3}\s+/m);

  const contentEnd =
    nextHeadingMatch?.index === undefined ? afterHeading.length : nextHeadingMatch.index;
  const sectionContent = afterHeading.slice(0, contentEnd).trim();

  return sectionContent;
}

/**
 * Validate Lessons Learned content length (≥50 non-whitespace chars).
 * Exported for testability.
 */
export function validateLessonsLearnedContent(content: string | null): boolean {
  if (content === null) {
    return false;
  }

  // Remove all whitespace and count characters
  const nonWhitespaceContent = content.replace(/\s+/g, "");
  return nonWhitespaceContent.length >= 50;
}

/**
 * Check if Lessons Learned appears after Completion Summary.
 * Exported for testability.
 */
export function validateLessonsLearnedPlacement(content: string): boolean {
  const completionMatch = content.match(/^## Completion Summary\s*$/m);
  const lessonsMatch = content.match(/^### Lessons Learned\s*$/m);

  if (!completionMatch || !lessonsMatch) {
    return false; // Missing sections handled separately
  }

  if (completionMatch.index === undefined || lessonsMatch.index === undefined) {
    return false;
  }

  return lessonsMatch.index > completionMatch.index;
}

/**
 * Create validation error for missing Completion Summary.
 */
function createMissingCompletionSummaryError(filePath: string): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message:
      'Completed plan missing required "## Completion Summary" section. ' +
      "Add this section with Deliverables and Impact subsections.",
    ruleId: "blueprint-completion-summary",
  };
}

/**
 * Create validation error for wrong task headers.
 */
function createWrongHeaderError(
  filePath: string,
  count: number,
  lineNumber: number | null,
): ValidationError {
  return {
    file: filePath,
    line: lineNumber ?? undefined,
    severity: "error",
    source: "blueprint-format",
    message:
      `Found ${count} task(s) using '### Task' (3 hashes). ` +
      `Blueprint plans require '#### Task' (4 hashes). See docs/templates/blueprint.md`,
    ruleId: "blueprint-task-format",
  };
}

/**
 * Create validation error for malformed task IDs.
 */
function createMalformedTaskIdError(filePath: string, count: number): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Found ${count} malformed task ID(s). Tasks must use numeric format: '#### Task 1.1: Title'`,
    ruleId: "blueprint-task-id-format",
  };
}

/**
 * Create validation error for bare dependency references.
 */
function createBareDepError(filePath: string, exampleLine: string): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Invalid depends format: '${exampleLine}'. Use 'Task X.Y' format, not just 'X.Y'.`,
    ruleId: "blueprint-depends-format",
  };
}

function createBlueprintStatusError(filePath: string, status: string): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Blueprint status "${status}" is not allowed. Use only: draft, planned, parked, in-progress, completed, archived.`,
    ruleId: "blueprint-status",
  };
}

function createTaskStatusMissingError(filePath: string, taskId: string): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Task ${taskId} is missing required **Status:** line.`,
    ruleId: "blueprint-task-status-required",
  };
}

function createTaskStatusInvalidError(
  filePath: string,
  taskId: string,
  status: string,
): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Task ${taskId} has invalid status "${status}". Use only: todo, in-progress, blocked, done, dropped.`,
    ruleId: "blueprint-task-status-invalid",
  };
}

function createBlockedReasonRequiredError(filePath: string, taskId: string): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Task ${taskId} is blocked but missing non-empty **Blocked:** reason.`,
    ruleId: "blueprint-task-blocked-reason-required",
  };
}

function createBlockedReasonMismatchError(
  filePath: string,
  taskId: string,
  status: string,
): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Task ${taskId} has **Blocked:** reason but status is ${status}.`,
    ruleId: "blueprint-task-blocked-reason-mismatch",
  };
}

function createDoneAcceptanceMismatchError(
  filePath: string,
  taskId: string,
  checked: number,
  total: number,
): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Task ${taskId} is done but acceptance is ${checked}/${total}.`,
    ruleId: "blueprint-task-done-acceptance",
  };
}

function createCompletedRequiresAllDoneError(
  filePath: string,
  taskId: string,
  taskStatus: string,
): ValidationError {
  return {
    file: filePath,
    severity: "error",
    source: "blueprint-format",
    message: `Blueprint status is completed but task ${taskId} is "${taskStatus}" (expected "done" or "dropped").`,
    ruleId: "blueprint-completed-requires-all-done",
  };
}

function validateLifecycleContract(filePath: string, content: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const frontmatter = extractFrontmatter(content);
  const status = frontmatter?.status?.trim();

  if (!status || !EXECUTABLE_BLUEPRINT_STATUSES.has(status)) {
    errors.push(createBlueprintStatusError(filePath, status ?? "(missing)"));
    return errors;
  }

  if (status !== "draft") {
    const title = frontmatter?.title?.trim();
    const owner = frontmatter?.owner?.trim();
    const complexity = extractComplexity(content);
    const lastUpdated = frontmatter?.last_updated?.trim();

    if (!title) {
      errors.push({
        file: filePath,
        severity: "error",
        source: "blueprint-format",
        message: "Blueprint is missing required frontmatter field: title.",
        ruleId: "blueprint-title-required",
      });
    }
    if (!owner) {
      errors.push({
        file: filePath,
        severity: "error",
        source: "blueprint-format",
        message: "Blueprint is missing required frontmatter field: owner.",
        ruleId: "blueprint-owner-required",
      });
    }
    if (!["XS", "S", "M", "L", "XL"].includes(complexity)) {
      errors.push({
        file: filePath,
        severity: "error",
        source: "blueprint-format",
        message: `Blueprint complexity "${complexity}" is invalid. Use only: XS, S, M, L, XL.`,
        ruleId: "blueprint-complexity-invalid",
      });
    }
    if (!lastUpdated || !/^\d{4}-\d{2}-\d{2}$/.test(lastUpdated.replace(/^['"]|['"]$/g, ""))) {
      errors.push({
        file: filePath,
        severity: "error",
        source: "blueprint-format",
        message: "Blueprint is missing valid frontmatter field: last_updated (YYYY-MM-DD).",
        ruleId: "blueprint-last-updated-required",
      });
    }
  }

  const taskBlocks = extractTaskBlocks(content);

  for (const task of taskBlocks) {
    const statusMatch = task.section.match(/\*\*Status:\*\*\s*(.+)/i);
    const blockedMatch = task.section.match(/\*\*Blocked:\*\*\s*(.+)/i);
    const checkboxMatches = Array.from(task.section.matchAll(/^- \[([ x])\]/gm));
    const total = checkboxMatches.length;
    const checked = checkboxMatches.filter((match) => match[1] === "x").length;

    if (!statusMatch?.[1]) {
      errors.push(createTaskStatusMissingError(filePath, task.id));
      continue;
    }

    const taskStatus = statusMatch[1].trim();
    if (!TASK_STATUSES.has(taskStatus)) {
      errors.push(createTaskStatusInvalidError(filePath, task.id, taskStatus));
      continue;
    }

    const blockedReason = blockedMatch?.[1]?.trim() ?? "";
    if (taskStatus === "blocked" && !blockedReason) {
      errors.push(createBlockedReasonRequiredError(filePath, task.id));
    }
    if (taskStatus !== "blocked" && blockedReason) {
      errors.push(createBlockedReasonMismatchError(filePath, task.id, taskStatus));
    }
    if (taskStatus === "done" && total > 0 && checked !== total) {
      errors.push(createDoneAcceptanceMismatchError(filePath, task.id, checked, total));
    }
  }

  if (status === "completed") {
    for (const task of taskBlocks) {
      const statusMatch = task.section.match(/\*\*Status:\*\*\s*(.+)/i);
      const taskStatus = statusMatch?.[1]?.trim();
      if (!taskStatus || !TASK_STATUSES.has(taskStatus)) {
        continue;
      }
      if (taskStatus !== "done" && taskStatus !== "dropped") {
        errors.push(createCompletedRequiresAllDoneError(filePath, task.id, taskStatus));
      }
    }
  }

  return errors;
}

/**
 * Validate task format (headers, IDs, dependencies).
 * Extracted to reduce complexity.
 */
function validateTaskFormat(filePath: string, content: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for ### Task instead of #### Task
  const wrongHeaderResult = findWrongTaskHeaders(content);
  if (wrongHeaderResult.count > 0) {
    errors.push(
      createWrongHeaderError(filePath, wrongHeaderResult.count, wrongHeaderResult.firstLineNumber),
    );
  }

  // Check for malformed task IDs
  const malformedCount = findMalformedTaskIds(content);
  if (malformedCount > 0) {
    errors.push(createMalformedTaskIdError(filePath, malformedCount));
  }

  // Check for bare dependency references
  const depCheckResult = checkDependencyFormat(content);
  if (depCheckResult.hasBareReferences && depCheckResult.exampleLine) {
    errors.push(createBareDepError(filePath, depCheckResult.exampleLine));
  }

  return errors;
}

/**
 * Validate Blueprint plan format for implementation plans.
 *
 * Only runs on files with doc type `blueprint`.
 * Returns array of validation errors found.
 *
 * @param filePath - File path for error reporting
 * @param content - File content to validate
 * @param docType - Document type from frontmatter
 * @returns Array of validation errors (empty if valid)
 */
export function validateBlueprintPlan(
  filePath: string,
  content: string,
  docType: string,
): ValidationError[] {
  if (docType !== "blueprint") {
    return [];
  }

  // Validate blueprint/task lifecycle contract and task format
  const errors = [
    ...validateTaskFormat(filePath, content),
    ...validateLifecycleContract(filePath, content),
  ];

  // Only validate Completion Summary and Lessons Learned for completed plans
  if (!isCompleted(filePath, content)) {
    return errors;
  }

  // Validate Completion Summary presence (required for ALL completed plans)
  if (!hasCompletionSummary(content)) {
    errors.push(createMissingCompletionSummaryError(filePath));
  }

  return errors;
}
