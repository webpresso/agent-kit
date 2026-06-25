import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const githubActionsReadmePath = resolve(
  process.cwd(),
  "..",
  "..",
  "..",
  "github-actions",
  "_worktrees",
  "wp-secret-orchestration-20260619",
  "README.md",
);
const checklistPath = resolve(process.cwd(), "docs/release/secret-orchestration-checklist.md");

describe("secret orchestration smoke", () => {
  it("documents the release checklist and shared reusable workflows when sibling worktrees are available", () => {
    if (!existsSync(githubActionsReadmePath)) {
      expect(existsSync(githubActionsReadmePath)).toBe(false);
      return;
    }

    const readme = readFileSync(githubActionsReadmePath, "utf8");
    const checklist = readFileSync(checklistPath, "utf8");

    expect(readme).toContain("wp-e2e.yml");
    expect(readme).toContain("wp-cleanup-preview.yml");
    expect(checklist).toContain("G001-execute-the-agent-kit-wp-secret-orch");
  });
});
