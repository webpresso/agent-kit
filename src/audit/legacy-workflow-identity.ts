import type { RepoAuditResult } from "./repo-guardrails.js";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RETIRED_TOKEN = ["g", "stack"].join("");
const RETIRED_ENV_PREFIX = ["WP_G", "STACK"].join("");

const SCAN_ENTRIES = [
  "package.json",
  "AGENTS.md",
  "README.md",
  "CLAUDE.md",
  "VISION.md",
  "catalog",
  "skills",
  "src",
  "scripts",
  "packages/workflow-skills",
] as const;

const ALLOWLIST_SUBSTRINGS = [
  "THIRD-PARTY-NOTICES.md",
  "packages/workflow-skills/NOTICE.",
  "packages/workflow-skills/provenance/",
  "catalog/agent/skills/third-party-manifest.json",
  "packages/workflow-skills/README.md",
] as const;

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".omx",
  ".codex",
  ".claude",
  "_worktrees",
  "blueprints",
  "docs",
  "tech-debt",
]);

function normalizePath(value: string): string {
  return value.split("\\").join("/");
}

function shouldAllow(relPath: string): boolean {
  return ALLOWLIST_SUBSTRINGS.some((allowed) => relPath.includes(allowed));
}

function walk(root: string, start: string): string[] {
  const results: string[] = [];
  const visit = (path: string): void => {
    const rel = normalizePath(relative(root, path));
    if (shouldAllow(rel)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(path.split(/[\\/]/u).at(-1) ?? "")) return;
      for (const entry of readdirSync(path)) visit(join(path, entry));
      return;
    }
    if (!stat.isFile()) return;
    if (/\.(?:test|integration|e2e)\.[tj]sx?$/u.test(path)) return;
    if (!/\.(?:ts|tsx|js|json|md|ya?ml|toml|txt)$/u.test(path)) return;
    results.push(path);
  };
  if (existsSync(start)) visit(start);
  return results;
}

export function auditLegacyWorkflowIdentity(root: string): RepoAuditResult {
  const files = SCAN_ENTRIES.flatMap((entry) => walk(root, join(root, entry)));
  const violations = files.flatMap((file) => {
    const rel = normalizePath(relative(root, file));
    const content = readFileSync(file, "utf8");
    const lowered = content.toLowerCase();
    const hasRetiredToken = lowered.includes(RETIRED_TOKEN);
    const hasRetiredEnv = content.includes(RETIRED_ENV_PREFIX);
    return hasRetiredToken || hasRetiredEnv
      ? [
          {
            file: rel,
            message:
              "active workflow/browser surfaces must not reference the retired external workflow identity",
          },
        ]
      : [];
  });

  return {
    ok: violations.length === 0,
    title: "Retired workflow identity audit",
    checked: files.length,
    violations,
  };
}
