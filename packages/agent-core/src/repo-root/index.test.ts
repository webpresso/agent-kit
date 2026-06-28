import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findRepoRoot, resolveFromRepoRoot } from "./index";

const created: string[] = [];
afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-core-root-"));
  created.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  return root;
}

describe("findRepoRoot", () => {
  it("resolves the workspace root from a nested start dir", () => {
    const root = makeWorkspace();
    const nested = join(root, "apps", "e2e", "src");
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
  });

  it("throws when no marker exists above the start dir", () => {
    const bare = mkdtempSync(join(tmpdir(), "agent-core-bare-"));
    created.push(bare);
    expect(() => findRepoRoot(join(bare, "deep", "nested"))).toThrow();
  });

  it("does not fall back to CLAUDE_PROJECT_DIR (strict walk)", () => {
    const bare = mkdtempSync(join(tmpdir(), "agent-core-strict-"));
    created.push(bare);
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = makeWorkspace();
    try {
      expect(() => findRepoRoot(join(bare, "deep"))).toThrow();
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prev;
    }
  });
});

describe("resolveFromRepoRoot", () => {
  it("joins segments onto the repo root", () => {
    expect(resolveFromRepoRoot("/repo", "apps", "e2e")).toBe("/repo/apps/e2e");
  });
});
