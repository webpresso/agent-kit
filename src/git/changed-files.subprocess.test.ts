import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultBranchBaseRef,
  getBranchChangedFiles,
  getGitTopLevel,
  getStagedFiles,
} from "./changed-files.js";

const tempDirs: string[] = [];

function createRepo(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  git(dir, "init", "-q");
  git(dir, "branch", "-m", "main");
  git(dir, "config", "user.email", "dev@example.com");
  git(dir, "config", "user.name", "Dev");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "config", "core.hooksPath", "/dev/null");
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function writeRepoFile(repo: string, relativePath: string, content: string): void {
  const absolutePath = path.join(repo, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("changed-files resolver", { timeout: 20_000 }, () => {
  it("uses origin/main as the default branch base ref", () => {
    expect(defaultBranchBaseRef({} as NodeJS.ProcessEnv)).toBe("origin/main");
    expect(defaultBranchBaseRef({ GITHUB_BASE_REF: "release/1.x" })).toBe("origin/release/1.x");
  });

  it("returns staged files with exact filenames preserved and no degradation", () => {
    const repo = createRepo("wp-git-changed-staged-");
    writeRepoFile(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-m", "base");

    const filename = "src/with space.ts";
    writeRepoFile(repo, filename, "export const value = 1\n");
    git(repo, "add", filename);

    expect(getStagedFiles(repo)).toEqual({
      files: [filename],
      degraded: false,
      reason: "ok",
    });
  });

  it("returns branch-changed files against an explicit base ref", () => {
    const repo = createRepo("wp-git-changed-branch-");
    writeRepoFile(repo, "src/base.ts", "export const base = true\n");
    git(repo, "add", "src/base.ts");
    git(repo, "commit", "-m", "base");

    writeRepoFile(repo, "src/feature.ts", "export const feature = true\n");
    git(repo, "add", "src/feature.ts");
    git(repo, "commit", "-m", "feature");

    expect(getBranchChangedFiles(repo, "HEAD~1")).toEqual({
      files: ["src/feature.ts"],
      degraded: false,
      reason: "ok",
    });
  });

  it("excludes deleted paths from branch-mode results via the ACMR filter", () => {
    const repo = createRepo("wp-git-changed-branch-filter-");
    writeRepoFile(repo, "src/remove-me.ts", "export const doomed = true\n");
    git(repo, "add", "src/remove-me.ts");
    git(repo, "commit", "-m", "base");

    git(repo, "rm", "src/remove-me.ts");
    git(repo, "commit", "-m", "delete");

    expect(getBranchChangedFiles(repo, "HEAD~1")).toEqual({
      files: [],
      degraded: false,
      reason: "empty",
    });
  });

  it("degrades with missing-base-ref when the default origin/main ref is unavailable", () => {
    const repo = createRepo("wp-git-changed-missing-base-");
    writeRepoFile(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-m", "base");

    expect(getBranchChangedFiles(repo)).toEqual({
      files: [],
      degraded: true,
      reason: "missing-base-ref",
    });
  });

  it("reports git-unavailable distinctly when git is missing from PATH", () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      expect(getGitTopLevel(process.cwd())).toBeNull();
      expect(getStagedFiles(process.cwd())).toEqual({
        files: [],
        degraded: true,
        reason: "git-unavailable",
      });
      expect(getBranchChangedFiles(process.cwd(), "origin/main")).toEqual({
        files: [],
        degraded: true,
        reason: "git-unavailable",
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("degrades with not-a-repo outside git worktrees", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wp-git-changed-nongit-"));
    tempDirs.push(dir);
    expect(existsSync(path.join(dir, ".git"))).toBe(false);

    expect(getStagedFiles(dir)).toEqual({
      files: [],
      degraded: true,
      reason: "not-a-repo",
    });
    expect(getBranchChangedFiles(dir)).toEqual({
      files: [],
      degraded: true,
      reason: "not-a-repo",
    });
  });

  it("filters staged gitlinks so submodule paths do not enter file-scoped runs", () => {
    const repo = createRepo("wp-git-changed-submodule-");
    writeRepoFile(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-m", "base");

    writeRepoFile(repo, "src/keep.ts", "export const keep = true\n");
    git(repo, "add", "src/keep.ts");
    const headSha = git(repo, "rev-parse", "HEAD");
    git(repo, "update-index", "--add", "--cacheinfo", `160000,${headSha},vendor/submodule`);

    expect(getStagedFiles(repo)).toEqual({
      files: ["src/keep.ts"],
      degraded: false,
      reason: "ok",
    });
  });
});
