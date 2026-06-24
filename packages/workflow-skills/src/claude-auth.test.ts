import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Claude skill helper snippets", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const skillPaths = [
    path.resolve(import.meta.dirname, "../skills/claude.md"),
    path.join(repoRoot, "catalog/agent/skills/claude/SKILL.md"),
    path.join(repoRoot, "skills/claude/SKILL.md"),
  ];
  const content = readFileSync(skillPaths[0]!, "utf8");

  it("uses Claude CLI login directly instead of API-key fallback auth", () => {
    expect(content).toContain("claude auth status --json");
    expect(content).toContain('claude auth status >"$AUTH_STATUS_FILE"');
    expect(content).toContain("CLAUDE_AUTH=cli-login");
    expect(content).toContain("run claude auth login with the intended Claude Max account");
    expect(content).toContain("claude --print");
    expect(content).toContain("CLAUDE_REVIEW_TIMEOUT");
    expect(content).toContain("do not recommend `--bare`");
    expect(content).not.toContain("claude auth status --output json");
    expect(content).not.toContain('claude -p "$(cat "$PROMPT_FILE")"');
    expect(content).not.toContain("claude -p");
    expect(content).not.toContain("claude --bare");
    expect(content).not.toContain("claude --print --bare");
    expect(content).not.toContain("ANTHROPIC_API_KEY");
    expect(content).not.toContain("CLAUDE_API_KEY");
    expect(content).not.toContain("CLAUDE_AUTH=api-key");
    expect(content).not.toContain("CLAUDE_AUTH=credentials-file");
    expect(content).not.toContain("$HOME/.claude/.credentials.json");
  });

  it("keeps source, staged, and packaged Claude skill surfaces free of stale auth fallbacks", () => {
    for (const skillPath of skillPaths) {
      const skill = readFileSync(skillPath, "utf8");
      expect(skill, skillPath).toContain("claude auth status --json");
      expect(skill, skillPath).toContain('claude auth status >"$AUTH_STATUS_FILE"');
      expect(skill, skillPath).toContain("claude --print");
      expect(skill, skillPath).toContain("CLAUDE_REVIEW_TIMEOUT");
      expect(skill, skillPath).toContain("head -c 12000");
      expect(skill, skillPath).toContain('node - "$PROMPT_FILE"');
      expect(skill, skillPath).toContain("Bounded prompt payload");
      expect(skill, skillPath).toContain("single-file / single-question first");
      expect(skill, skillPath).toContain("do not recommend `--bare`");
      expect(skill, skillPath).not.toContain("python3");
      expect(skill, skillPath).not.toContain("import subprocess");
      expect(skill, skillPath).not.toContain("claude auth status --output json");
      expect(skill, skillPath).not.toContain('claude -p "$(cat "$PROMPT_FILE")"');
      expect(skill, skillPath).not.toContain("claude --bare");
      expect(skill, skillPath).not.toContain("claude --print --bare");
      expect(skill, skillPath).not.toContain("ANTHROPIC_API_KEY");
      expect(skill, skillPath).not.toContain("CLAUDE_API_KEY");
      expect(skill, skillPath).not.toContain("CLAUDE_AUTH=api-key");
      expect(skill, skillPath).not.toContain("CLAUDE_AUTH=credentials-file");
      expect(skill, skillPath).not.toContain("$HOME/.claude/.credentials.json");
      expect(skill, skillPath).not.toContain("$HOME/.config/claude/credentials.json");
    }
  });

  it("requires explicit logged-in booleans across all staged Claude skill surfaces", () => {
    for (const skillPath of skillPaths) {
      const skill = readFileSync(skillPath, "utf8");
      expect(skill).toContain('"$AUTH_STATUS_FILE"');
      expect(skill).toContain('"(authenticated|loggedIn|success)"[[:space:]]*:[[:space:]]*true');
      expect(skill).not.toMatch(/grep -E .*claude\.ai/);
    }
  });

  it("keeps the Claude review timeout long enough for first-party CLI latency", () => {
    for (const skillPath of skillPaths) {
      const skill = readFileSync(skillPath, "utf8");
      expect(skill, skillPath).toContain(
        "CLAUDE_REVIEW_TIMEOUT_SECONDS=${CLAUDE_REVIEW_TIMEOUT_SECONDS:-180}",
      );
      expect(skill, skillPath).not.toContain(
        "CLAUDE_REVIEW_TIMEOUT_SECONDS=${CLAUDE_REVIEW_TIMEOUT_SECONDS:-45}",
      );
    }
  });

  it("uses portable Darwin-safe mktemp patterns", () => {
    expect(content).toContain("mktemp -t wp-claude-auth.XXXXXX");
    expect(content).toContain("mktemp -t wp-claude-review.XXXXXX");
    expect(content).not.toMatch(/XXXXXX\.[a-z]+/);
    expect(content).not.toContain("/tmp/wp-claude-auth.json");
  });
});
