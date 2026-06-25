import type { Dirent } from "node:fs";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage"]);
const PRODUCTION_TS_EXTENSIONS = [".ts", ".tsx"] as const;

function isProductionTypeScriptFile(path: string): boolean {
  if (!PRODUCTION_TS_EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
  return !/(?:^|[./-])(?:test|spec|integration|e2e)\.tsx?$/u.test(path);
}

function walk(dir: string, root: string, violations: RepoAuditViolation[]): number {
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return 0;
  }

  let checked = 0;
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      checked += walk(fullPath, root, violations);
      continue;
    }
    if (!entry.isFile() || !isProductionTypeScriptFile(fullPath)) continue;

    checked += 1;
    const content = readFileSync(fullPath, "utf8");
    if (/Math[.]random/u.test(content)) {
      violations.push({
        file: relative(root, fullPath).replace(/\\/gu, "/"),
        message:
          "production source must use node:crypto-derived IDs instead of predictable PRNG output",
      });
    }
  }
  return checked;
}

export function auditNoMathRandom(rootDirectory: string = process.cwd()): RepoAuditResult {
  const srcRoot = join(rootDirectory, "src");
  const violations: RepoAuditViolation[] = [];
  const checked = walk(srcRoot, rootDirectory, violations);

  return {
    ok: violations.length === 0,
    title: "no-math-random",
    checked,
    violations,
  };
}
