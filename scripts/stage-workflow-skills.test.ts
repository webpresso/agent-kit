import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  stageWorkflowSkills,
  validateWorkflowSkillsStagingPolicy,
} from "./stage-workflow-skills.js";

const roots: string[] = [];

function fixtureRepo(): string {
  const root = path.join(
    tmpdir(),
    `stage-workflow-skills-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  roots.push(root);
  mkdirSync(root, { recursive: true });
  cpSync(path.resolve("packages/workflow-skills"), path.join(root, "packages/workflow-skills"), {
    recursive: true,
    filter: (source) =>
      !source.includes(`${path.sep}node_modules${path.sep}`) &&
      !source.endsWith(`${path.sep}node_modules`),
  });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("stageWorkflowSkills", () => {
  it("copies only allowlisted skills deterministically", () => {
    const root = fixtureRepo();
    const first = stageWorkflowSkills(root);
    const second = stageWorkflowSkills(root);

    expect(second).toEqual(first);
    expect(first.staged).toEqual([
      "catalog/agent/skills/autoplan/SKILL.md",
      "catalog/agent/skills/browse/SKILL.md",
      "catalog/agent/skills/claude/SKILL.md",
      "catalog/agent/skills/codex/SKILL.md",
      "catalog/agent/skills/deepseek/SKILL.md",
      "catalog/agent/skills/design-review/SKILL.md",
      "catalog/agent/skills/devex-review/SKILL.md",
      "catalog/agent/skills/glm/SKILL.md",
      "catalog/agent/skills/health/SKILL.md",
      "catalog/agent/skills/hy3/SKILL.md",
      "catalog/agent/skills/investigate/SKILL.md",
      "catalog/agent/skills/kimi/SKILL.md",
      "catalog/agent/skills/mimo/SKILL.md",
      "catalog/agent/skills/minimax/SKILL.md",
      "catalog/agent/skills/opencode-go/SKILL.md",
      "catalog/agent/skills/plan-ceo-review/SKILL.md",
      "catalog/agent/skills/plan-design-review/SKILL.md",
      "catalog/agent/skills/plan-devex-review/SKILL.md",
      "catalog/agent/skills/plan-eng-review/SKILL.md",
      "catalog/agent/skills/qa-only/SKILL.md",
      "catalog/agent/skills/qa/SKILL.md",
      "catalog/agent/skills/qwen/SKILL.md",
      "catalog/agent/skills/review/SKILL.md",
    ]);
    const stagedClaude = readFileSync(
      path.join(root, "catalog/agent/skills/claude/SKILL.md"),
      "utf8",
    );
    expect(stagedClaude).toContain("name: claude");
    expect(stagedClaude).toContain("claude auth status --json");
    expect(stagedClaude).toContain('claude auth status >"$AUTH_STATUS_FILE"');
    expect(stagedClaude).toContain("claude --print");
    expect(stagedClaude).toContain("CLAUDE_REVIEW_TIMEOUT");
    expect(stagedClaude).toContain("Bounded prompt payload");
    expect(stagedClaude).toContain("single-file / single-question first");
    expect(stagedClaude).toContain("do not recommend `--bare`");
    expect(stagedClaude).toContain("Do not add artificial budget caps");
    expect(stagedClaude).not.toContain("claude auth status --output json");
    expect(stagedClaude).not.toContain('claude -p "$(cat "$PROMPT_FILE")"');
    expect(stagedClaude).not.toContain("claude --bare");
    expect(stagedClaude).not.toContain("claude --print --bare");
    expect(stagedClaude).not.toContain("--max-budget-usd");
    expect(stagedClaude).not.toContain("ANTHROPIC_API_KEY");
    expect(stagedClaude).not.toContain("CLAUDE_AUTH=credentials-file");
    expect(readFileSync(path.join(root, "catalog/agent/skills/codex/SKILL.md"), "utf8")).toContain(
      "codex exec --sandbox read-only",
    );
    // Qwen reviewer resolves its model from the live catalog (no hardcoded
    // version ID), so assert the live-discovery marker rather than a pinned ID.
    expect(readFileSync(path.join(root, "catalog/agent/skills/qwen/SKILL.md"), "utf8")).toContain(
      "grep '^opencode-go/qwen'",
    );
  });

  it("rejects denied paths and missing NOTICE/provenance", () => {
    const root = fixtureRepo();
    mkdirSync(path.join(root, "packages/workflow-skills/browse/dist"), { recursive: true });
    writeFileSync(path.join(root, "packages/workflow-skills/browse/dist/app.js"), "x");
    expect(() => validateWorkflowSkillsStagingPolicy(root)).toThrow(/denied workflow skills path/);

    rmSync(path.join(root, "packages/workflow-skills/browse"), { recursive: true, force: true });
    rmSync(path.join(root, "packages/workflow-skills/NOTICE.workflow-skills.md"));
    expect(() => validateWorkflowSkillsStagingPolicy(root)).toThrow(
      /missing workflow skills NOTICE/,
    );
  });

  it("rejects denied heavy-runtime content in staged skills", () => {
    const root = fixtureRepo();
    writeFileSync(
      path.join(root, "packages/workflow-skills/skills/review.md"),
      `${readFileSync(path.join(root, "packages/workflow-skills/skills/review.md"), "utf8")}\npuppeteer\n`,
    );
    expect(() => stageWorkflowSkills(root)).toThrow(
      /denied workflow skills content matched puppeteer/,
    );
  });

  it("counts non-allowlisted source files against the package payload budget", () => {
    const root = fixtureRepo();
    mkdirSync(path.join(root, "packages/workflow-skills/assets"), { recursive: true });
    writeFileSync(path.join(root, "packages/workflow-skills/assets/large.txt"), "x".repeat(1024));
    const policy = {
      ...JSON.parse(
        readFileSync(path.join(root, "packages/workflow-skills/staging/allowlist.json"), "utf8"),
      ),
      sizeBudgetBytes: 512,
    };

    expect(() => validateWorkflowSkillsStagingPolicy(root, policy)).toThrow(
      /workflow skills source payload .* exceeds budget/,
    );
  });
});
