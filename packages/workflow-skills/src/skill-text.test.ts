import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("@repo/workflow-skills skill text contract", () => {
  it("uses unprefixed Webpresso-owned skill names without external checkout requirements", () => {
    const skillsDir = path.resolve(import.meta.dirname, "../skills");
    for (const file of readdirSync(skillsDir)) {
      const content = readFileSync(path.join(skillsDir, file), "utf8");
      const retiredToken = ["g", "stack"].join("");
      expect(content).not.toContain(`${retiredToken}-`);
      expect(content).not.toContain(`~/.claude/skills/${retiredToken}`);
      expect(content).not.toContain(`~/.codex/skills/${retiredToken}`);
      expect(content).not.toContain("/tmp/wp-claude-auth");
      expect(content).not.toMatch(
        /browse\/dist|design\/dist|make-pdf\/dist|puppeteer|ngrok|html-to-docx/i,
      );
    }
  });

  it("recognizes Claude first-party auth only from explicit truthy auth fields", () => {
    const claudeSkill = readFileSync(
      path.resolve(import.meta.dirname, "../skills/claude.md"),
      "utf8",
    );

    expect(claudeSkill).toContain('"(authenticated|loggedIn|success)"');
    expect(claudeSkill).not.toContain("|claude\\.ai");
    expect(claudeSkill).not.toContain("claude.ai");
  });

  it("documents the bounded Claude review contract", () => {
    const claudeSkill = readFileSync(
      path.resolve(import.meta.dirname, "../skills/claude.md"),
      "utf8",
    );

    expect(claudeSkill).toContain("claude --print");
    expect(claudeSkill).toContain("CLAUDE_REVIEW_TIMEOUT");
    expect(claudeSkill).toContain("Bounded prompt payload");
    expect(claudeSkill).toContain("single-file / single-question first");
    expect(claudeSkill).toContain("Split-and-retry-once fallback");
    expect(claudeSkill).toContain("Do not add artificial budget caps");
    expect(claudeSkill).not.toContain("--max-budget-usd");
  });

  it("ships Codex and all OpenCode Go model-family reviewer skills", () => {
    const skillsDir = path.resolve(import.meta.dirname, "../skills");
    const required = [
      "codex",
      "opencode-go",
      "deepseek",
      "glm",
      "kimi",
      "minimax",
      "mimo",
      "qwen",
      "hy3",
    ];
    for (const name of required) {
      const content = readFileSync(path.join(skillsDir, `${name}.md`), "utf8");
      expect(content).toContain(`name: ${name}`);
    }

    const opencodeSkills = required.filter((name) => name !== "codex");
    for (const name of opencodeSkills) {
      const content = readFileSync(path.join(skillsDir, `${name}.md`), "utf8");
      expect(content).toContain("opencode run --model");
      // The `opencode run` command line must NOT pass `--dir "$PWD"`: it forces a
      // redundant full-repo index that stalls reviews (and times out under load).
      // opencode already operates on the current working directory. The rationale
      // prose may mention `--dir` to warn against it, so assert on the command
      // line specifically, not the whole document.
      const runLine =
        content.split("\n").find((line) => line.startsWith("opencode run --model")) ?? "";
      // Live discovery: the run command must NOT hardcode a versioned model ID;
      // it resolves the current model from the live catalog so new OpenCode Go
      // releases are picked up automatically (no drift). `?? ""` keeps the
      // assertions meaningful (a missing command line fails toContain clearly)
      // without a weak toBeDefined.
      expect(runLine).toContain('--model "$MODEL"');
      expect(runLine).not.toContain("--dir");
      expect(content).not.toMatch(/opencode run --model opencode-go\//);
      expect(content).toContain("opencode models opencode-go");
      expect(content).toMatch(/grep '\^opencode-go\//);
      // Positive contract: the resolution heuristic itself must be present.
      expect(content).toContain("sort -V | tail -1");
      // Family + aggregate reviewers read the catalog once into $CATALOG and
      // re-grep the variable (no double `opencode models` round-trip). The
      // parked hy3 reviewer is a single inline pipe, so it is exempt.
      if (name !== "hy3") {
        expect(content).toContain('echo "$CATALOG"');
        expect(content).toContain("CATALOG=$(opencode models opencode-go)");
      }
    }
  });

  it("keeps projected workflow skill surfaces byte-identical to their sources", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const names = [
      "claude",
      "review",
      "autoplan",
      "investigate",
      "health",
      "plan-eng-review",
      "plan-ceo-review",
      "plan-design-review",
      "plan-devex-review",
      "browse",
      "qa-only",
      "qa",
      "devex-review",
      "design-review",
      "codex",
      "opencode-go",
      "deepseek",
      "glm",
      "hy3",
      "kimi",
      "mimo",
      "minimax",
      "qwen",
    ];

    for (const name of names) {
      const source = readFileSync(
        path.join(repoRoot, "packages/workflow-skills/skills", `${name}.md`),
        "utf8",
      );
      const catalog = readFileSync(
        path.join(repoRoot, "catalog/agent/skills", name, "SKILL.md"),
        "utf8",
      );
      const packageRoot = readFileSync(path.join(repoRoot, "skills", name, "SKILL.md"), "utf8");

      expect(catalog).toBe(source);
      expect(packageRoot).toBe(source);
    }
  });

  it("requires docs/help/instruction drift checks for command-surface changes", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    for (const file of [
      path.join(repoRoot, "catalog/agent/skills/verify/SKILL.md"),
      path.join(repoRoot, "skills/verify/SKILL.md"),
    ]) {
      const content = readFileSync(file, "utf8");
      expect(content).toContain("command, install path, setup path, update path");
      expect(content).toContain("CLI help text");
      expect(content).toContain("docs/guides");
      expect(content).toContain("generated instruction templates");
      expect(content).toContain("skill text and catalog references");
      expect(content).toContain("which docs/help/instruction surfaces were refreshed");
      expect(content).toContain("public-package-safety or package-surface leak checks");
    }
  });

  it("keeps optional-tool installer guidance on wp/vp surfaces rather than npm or npx", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../..");
    const userFacingFiles = [
      "docs/add-ons.md",
      "AGENTS.md",
      "catalog/AGENTS.md.tpl",
      "src/cli/cli.ts",
      "src/cli/commands/package-manager.ts",
      "src/cli/commands/init/index.ts",
      "src/cli/commands/blueprint/router.ts",
    ];

    for (const file of userFacingFiles) {
      const content = readFileSync(path.join(repoRoot, file), "utf8");
      expect(content).not.toMatch(/npm install -g|npx\s/);
    }
  });
});
