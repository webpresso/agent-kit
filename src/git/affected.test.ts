import { describe, expect, it } from "vitest";

import type { ChangedFilesResult } from "#git/changed-files";
import { resolveAffectedTargets } from "./affected.js";

function ok(files: string[]): ChangedFilesResult {
  return { files, degraded: false, reason: files.length === 0 ? "empty" : "ok" };
}

describe("resolveAffectedTargets", () => {
  it("rejects --branch without --affected", () => {
    const result = resolveAffectedTargets({
      commandName: "lint",
      affected: false,
      branch: true,
      explicitTargets: [],
      policy: "fallback-full",
      mapChangedFiles: (files) => files,
      emptyMessage: () => "empty",
      degradedFallbackMessage: (reason) => `fallback ${reason}`,
      degradedFailClosedMessage: (reason) => `fail ${reason}`,
    });

    expect(result).toStrictEqual({ kind: "invalid", message: "--branch requires --affected" });
  });

  it("rejects --affected with explicit target flags", () => {
    const result = resolveAffectedTargets({
      commandName: "test",
      affected: true,
      branch: false,
      explicitTargets: ["src/index.ts"],
      explicitTargetFlags: "--file",
      policy: "fallback-full",
      mapChangedFiles: (files) => files,
      emptyMessage: () => "empty",
      degradedFallbackMessage: (reason) => `fallback ${reason}`,
      degradedFailClosedMessage: (reason) => `fail ${reason}`,
    });

    expect(result).toStrictEqual({
      kind: "invalid",
      message: "Cannot use --affected and --file together.",
    });
  });

  it("uses staged files by default and maps changed files to scoped targets", () => {
    const result = resolveAffectedTargets(
      {
        commandName: "format",
        cwd: "/repo/subdir",
        affected: true,
        branch: false,
        explicitTargets: [],
        policy: "fallback-full",
        mapChangedFiles: (files, root) => files.map((file) => `${root}:${file}`),
        emptyMessage: () => "empty",
        degradedFallbackMessage: (reason) => `fallback ${reason}`,
        degradedFailClosedMessage: (reason) => `fail ${reason}`,
      },
      {
        getGitTopLevel: () => "/repo",
        getStagedFiles: () => ok(["src/index.ts"]),
      },
    );

    expect(result).toStrictEqual({
      kind: "scoped",
      cwd: "/repo",
      scope: "staged",
      changedFiles: ["src/index.ts"],
      targets: ["/repo:src/index.ts"],
    });
  });

  it("uses branch changed files when --branch is enabled", () => {
    const result = resolveAffectedTargets(
      {
        commandName: "lint",
        cwd: "/repo",
        affected: true,
        branch: true,
        baseRef: "origin/main",
        explicitTargets: [],
        policy: "fallback-full",
        mapChangedFiles: (files) => files,
        emptyMessage: () => "empty",
        degradedFallbackMessage: (reason) => `fallback ${reason}`,
        degradedFailClosedMessage: (reason) => `fail ${reason}`,
      },
      {
        getGitTopLevel: () => "/repo",
        getBranchChangedFiles: (_cwd, baseRef) => ok([`base:${baseRef}`]),
      },
    );

    expect(result).toMatchObject({
      kind: "scoped",
      scope: "branch",
      targets: ["base:origin/main"],
    });
  });

  it("returns empty with caller-owned messaging when mapping finds no targets", () => {
    const result = resolveAffectedTargets(
      {
        commandName: "lint",
        cwd: "/repo",
        affected: true,
        branch: true,
        explicitTargets: [],
        policy: "fallback-full",
        mapChangedFiles: () => [],
        emptyMessage: (scope) => `empty ${scope}`,
        degradedFallbackMessage: (reason) => `fallback ${reason}`,
        degradedFailClosedMessage: (reason) => `fail ${reason}`,
      },
      {
        getGitTopLevel: () => "/repo",
        getBranchChangedFiles: () => ok(["README.md"]),
      },
    );

    expect(result).toStrictEqual({
      kind: "empty",
      cwd: "/repo",
      scope: "branch",
      message: "empty branch",
    });
  });

  it("falls back for degraded read/check surfaces", () => {
    const result = resolveAffectedTargets(
      {
        commandName: "test",
        cwd: "/repo",
        affected: true,
        branch: false,
        explicitTargets: [],
        policy: "fallback-full",
        mapChangedFiles: (files) => files,
        emptyMessage: () => "empty",
        degradedFallbackMessage: (reason) => `fallback ${reason}`,
        degradedFailClosedMessage: (reason) => `fail ${reason}`,
      },
      {
        getGitTopLevel: () => "/repo",
        getStagedFiles: () => ({ files: [], degraded: true, reason: "git-error" }),
      },
    );

    expect(result).toStrictEqual({
      kind: "degraded-fallback",
      cwd: "/repo",
      scope: "staged",
      reason: "git-error",
      message: "fallback git-error",
    });
  });

  it("fails closed for degraded write surfaces", () => {
    const result = resolveAffectedTargets(
      {
        commandName: "format",
        cwd: "/repo",
        affected: true,
        branch: false,
        explicitTargets: [],
        policy: "fail-closed",
        mapChangedFiles: (files) => files,
        emptyMessage: () => "empty",
        degradedFallbackMessage: (reason) => `fallback ${reason}`,
        degradedFailClosedMessage: (reason) => `fail ${reason}`,
      },
      {
        getGitTopLevel: () => "/repo",
        getStagedFiles: () => ({ files: [], degraded: true, reason: "missing-base-ref" }),
      },
    );

    expect(result).toStrictEqual({
      kind: "degraded-fail-closed",
      cwd: "/repo",
      scope: "staged",
      reason: "missing-base-ref",
      message: "fail missing-base-ref",
    });
  });
});
