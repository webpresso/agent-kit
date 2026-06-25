import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GENERATED_PATHS_BLOCK } from "#cli/commands/init/gitignore-patcher";
import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";

const EXPECTED_PATHS = GENERATED_PATHS_BLOCK.patterns.filter((line) => !line.startsWith("#"));

function lastMatchingRule(lines: readonly string[], expected: string): string | undefined {
  let last: string | undefined;
  const negatedPrefix = `!${expected}`;
  for (const line of lines) {
    if (line === expected || line === `!${expected}` || line.startsWith(negatedPrefix)) {
      last = line;
    }
  }
  return last;
}

export async function auditGitignoreAgentSurfaces(cwd: string): Promise<RepoAuditResult> {
  const gitignorePath = join(cwd, ".gitignore");
  const violations: RepoAuditViolation[] = [];

  if (!existsSync(gitignorePath)) {
    return {
      ok: false,
      title: "gitignore agent surfaces",
      checked: EXPECTED_PATHS.length,
      violations: [
        { file: ".gitignore", message: ".gitignore not found — run `wp setup` to scaffold it" },
      ],
    };
  }

  let content: string;
  try {
    content = readFileSync(gitignorePath, "utf-8");
  } catch {
    return {
      ok: false,
      title: "gitignore agent surfaces",
      checked: EXPECTED_PATHS.length,
      violations: [{ file: ".gitignore", message: "failed to read .gitignore" }],
    };
  }

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const lineSet = new Set(lines);

  for (const expected of EXPECTED_PATHS) {
    if (!lineSet.has(expected)) {
      violations.push({
        file: ".gitignore",
        message: `Missing gitignore entry: ${expected} — run \`wp setup\` to add generated agent surface paths`,
      });
      continue;
    }
    const last = lastMatchingRule(lines, expected);
    if (last?.startsWith("!")) {
      violations.push({
        file: ".gitignore",
        message: `Gitignore entry ${expected} is overridden by later exception ${last} — run \`wp setup\` to move the generated surface block to the end`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    title: "gitignore agent surfaces",
    checked: EXPECTED_PATHS.length,
    violations,
  };
}
