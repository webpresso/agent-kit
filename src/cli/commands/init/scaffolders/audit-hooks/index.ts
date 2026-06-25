/**
 * `audit-hooks` scaffolder preset.
 *
 * Extends `.husky/pre-commit` to ensure formatting and shared policy checks
 * are present.
 *
 * Additive: appends the managed audit block only when the audits are not
 * already present (idempotent). Does not remove existing content.
 *
 * Formatting and guardrail selection are scoped through wp-owned --affected
 * surfaces. Shell code only handles hook mechanics such as re-staging
 * formatter rewrites. The whole-repo guardrails suite is CI-owned and is
 * intentionally NOT run here.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { MergeOptions } from "#cli/commands/init/merge";

export interface ScaffoldAuditHooksInput {
  repoRoot: string;
  options: MergeOptions;
}

export interface ScaffoldAuditHooksResult {
  preCommitPath: string;
  action: "created" | "appended" | "identical" | "skipped-dry";
}

const AUDIT_HOOK_HEADER = "# webpresso audit hooks (affected mode — fast)";

/**
 * The managed audit block. Formatting and audit selection are delegated to wp.
 * The only shell-side file selection re-stages formatter rewrites for files
 * that were already staged. Keep this batched: large formatting-only commits
 * must not spawn one `git add` process per file.
 */
const AUDIT_HOOK_BLOCK = [
  AUDIT_HOOK_HEADER,
  "wp format --affected || exit 1",
  "if ! git diff --cached --quiet --diff-filter=ACMR; then",
  "  git diff -z --cached --name-only --diff-filter=ACMR |",
  "    git add --pathspec-from-file=- --pathspec-file-nul || exit 1",
  "fi",
  "wp audit guardrails --affected",
].join("\n");

const SHEBANG = "#!/bin/sh\n";

/**
 * True when the managed fast audits already run in the hook, in any form
 * (bare `wp`, `"$WP"`, `"$ROOT/bin/wp"`, or the legacy `*.ts` script paths).
 * Keyed on the audit invocations themselves — not the header comment — so a
 * stale header without the real audits still gets the block appended.
 */
function hasAuditBlock(existingContent: string): boolean {
  return (
    existingContent.includes("wp format --affected") &&
    existingContent.includes("git add --pathspec-from-file=- --pathspec-file-nul") &&
    existingContent.includes("|| exit 1") &&
    existingContent.includes("audit guardrails --affected")
  );
}

/**
 * Append the managed audit block to `.husky/pre-commit` if the audits are not
 * already present. Creates the file with a shebang if it does not exist.
 * Idempotent: re-running produces no change when the audits are present.
 */
export function scaffoldAuditHooks(input: ScaffoldAuditHooksInput): ScaffoldAuditHooksResult {
  const preCommitPath = path.join(input.repoRoot, ".husky", "pre-commit");

  if (input.options.dryRun) {
    return { preCommitPath, action: "skipped-dry" };
  }

  const huskyDir = path.dirname(preCommitPath);
  mkdirSync(huskyDir, { recursive: true });

  const existingContent = existsSync(preCommitPath) ? readFileSync(preCommitPath, "utf8") : null;

  if (existingContent === null) {
    writeFileSync(preCommitPath, SHEBANG + AUDIT_HOOK_BLOCK + "\n", "utf8");
    return { preCommitPath, action: "created" };
  }

  if (hasAuditBlock(existingContent)) {
    return { preCommitPath, action: "identical" };
  }

  const separator = existingContent.endsWith("\n") ? "" : "\n";
  writeFileSync(preCommitPath, existingContent + separator + AUDIT_HOOK_BLOCK + "\n", "utf8");
  return { preCommitPath, action: "appended" };
}
