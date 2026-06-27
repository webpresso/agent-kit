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
  const root = mkdtempSync(join(tmpdir(), "ak-repo-root-"));
  created.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  return root;
}

describe("findRepoRoot", () => {
  it("resolves the workspace root from a nested start dir via the pnpm-workspace marker", () => {
    const root = makeWorkspace();
    const nested = join(root, "apps", "e2e", "src");
    mkdirSync(nested, { recursive: true });
    // Walk uses the literal dirname chain, so the nested start resolves back to
    // the exact mkdtemp root (no realpath normalization needed).
    expect(findRepoRoot(nested)).toBe(root);
    expect(findRepoRoot(root)).toBe(root);
  });

  it("throws when no workspace marker exists above the start dir", () => {
    const bare = mkdtempSync(join(tmpdir(), "ak-no-marker-"));
    created.push(bare);
    // A bare temp dir under the OS tmpdir has no .git/pnpm-workspace.yaml/package.json
    // chain we control; resolving should fail closed rather than silently widen.
    expect(() => findRepoRoot(join(bare, "deep", "nested"))).toThrow();
  });

  it("does NOT fall back to CLAUDE_PROJECT_DIR for a marker-less start (strict walk)", () => {
    const bare = mkdtempSync(join(tmpdir(), "ak-strict-"));
    created.push(bare);
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = makeWorkspace(); // a real root, must be ignored
    try {
      // Must throw, NOT silently return the ambient CLAUDE_PROJECT_DIR root.
      expect(() => findRepoRoot(join(bare, "deep"))).toThrow();
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prev;
    }
  });
});

describe("resolveFromRepoRoot", () => {
  it("joins path segments onto the repo root", () => {
    expect(resolveFromRepoRoot("/repo", "apps", "e2e")).toBe("/repo/apps/e2e");
  });
});
