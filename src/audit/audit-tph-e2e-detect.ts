/**
 * Pure detection logic for TPH E2E audit.
 * Zero I/O — accepts pre-read file contents, returns structured results.
 */

export interface Violation {
  file: string;
  severity: "ERROR" | "WARNING" | "INFO";
  rule: string;
  message: string;
}

export interface AuditResult {
  filesChecked: number;
  violations: Violation[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface FileInput {
  path: string;
  contents: string;
}

const INTERNAL_API_PATTERN = /\b(?:app|router|server|auth|handler)\.(?:handle|fetch|dispatch)\(/g;
const INTERNAL_HANDLER_PATTERN = /\b[a-zA-Z0-9_]+\.handler\(/g;
const MOCK_PATTERN = /\b(?:vi|jest)\.mock\(|mockResolvedValue|mockReturnValue/g;
const DRY_RUN_PATTERN = /dryRun\s*:\s*true|dry-run\s*.*true/g;

const ERROR_TITLE_PATTERN = /(error|invalid|reject|fail|unauthorized)/i;
const MIXED_TITLE_PATTERN = /(mixed|partial|graceful|degradation)/i;

function collectTestTitles(content: string): string[] {
  const titles: string[] = [];

  for (const match of content.matchAll(/\b(?:it|test)\s*\(\s*(['"`])([^'"`]+)\1/gu)) {
    titles.push(match[2] ?? "");
  }

  for (const match of content.matchAll(
    /\b(?:it|test)\.each(?:<[^>]+>)?\s*\([\s\S]*?\)\s*\(\s*(['"`])([^'"`]+)\1/gu,
  )) {
    titles.push(match[2] ?? "");
  }

  return titles;
}

function hasTitlePattern(content: string, pattern: RegExp): boolean {
  return collectTestTitles(content).some((title) => pattern.test(title));
}

function auditFileContents(filePath: string, contents: string): Violation[] {
  const violations: Violation[] = [];

  // Reset lastIndex on global regexes before use
  INTERNAL_API_PATTERN.lastIndex = 0;
  INTERNAL_HANDLER_PATTERN.lastIndex = 0;
  MOCK_PATTERN.lastIndex = 0;
  DRY_RUN_PATTERN.lastIndex = 0;

  if (INTERNAL_API_PATTERN.test(contents) || INTERNAL_HANDLER_PATTERN.test(contents)) {
    violations.push({
      file: filePath,
      severity: "ERROR",
      rule: "internal-api-call",
      message: "E2E tests must not call internal handlers or routers. Use real HTTP/browser flow.",
    });
  }

  if (MOCK_PATTERN.test(contents)) {
    violations.push({
      file: filePath,
      severity: "ERROR",
      rule: "e2e-mocking",
      message: "E2E tests must not mock. Use real dependencies and boundaries.",
    });
  }

  if (DRY_RUN_PATTERN.test(contents)) {
    violations.push({
      file: filePath,
      severity: "ERROR",
      rule: "e2e-dry-run",
      message: "E2E tests must execute real behavior (no dry-run).",
    });
  }

  if (!hasTitlePattern(contents, ERROR_TITLE_PATTERN)) {
    violations.push({
      file: filePath,
      severity: "INFO",
      rule: "missing-error-coverage",
      message: "No E2E test title indicates error/invalid/reject coverage.",
    });
  }

  if (!hasTitlePattern(contents, MIXED_TITLE_PATTERN)) {
    violations.push({
      file: filePath,
      severity: "INFO",
      rule: "missing-mixed-coverage",
      message: "No E2E test title indicates mixed/partial/graceful coverage.",
    });
  }

  return violations;
}

/**
 * Pure detection function for E2E audit.
 * Takes pre-read file contents, returns structured result. No I/O.
 */
export function detectTphE2eViolations(files: FileInput[]): AuditResult {
  const violations: Violation[] = [];

  for (const file of files) {
    violations.push(...auditFileContents(file.path, file.contents));
  }

  return {
    filesChecked: files.length,
    violations,
    errorCount: violations.filter((v) => v.severity === "ERROR").length,
    warningCount: violations.filter((v) => v.severity === "WARNING").length,
    infoCount: violations.filter((v) => v.severity === "INFO").length,
  };
}
