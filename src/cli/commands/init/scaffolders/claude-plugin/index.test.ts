import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { CLAUDE_PLUGIN_ID, ensureClaudeCodeUserPlugin } from "./index.js";

const tempRoots: string[] = [];

function makePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-claude-plugin-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), '{"name":"webpresso"}\n', "utf8");
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  delete process.env.WP_SKIP_CLAUDE_PLUGIN;
});

describe("ensureClaudeCodeUserPlugin", () => {
  it("runs marketplace add, install, and update at user scope", () => {
    const packageRoot = makePackageRoot();
    const calls: Array<{ command: string; args: readonly string[] }> = [];

    const result = ensureClaudeCodeUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      env: {},
      commandExists: () => true,
      runCommand: (command, args) => {
        calls.push({ command, args });
        return 0;
      },
    });

    expect(result).toEqual({
      kind: "claude-plugin-installed",
      packageRoot,
      pluginId: CLAUDE_PLUGIN_ID,
    });
    expect(calls).toEqual([
      {
        command: "claude",
        args: ["plugin", "marketplace", "add", "--scope", "user", packageRoot],
      },
      {
        command: "claude",
        args: ["plugin", "install", "--scope", "user", CLAUDE_PLUGIN_ID],
      },
      {
        command: "claude",
        args: ["plugin", "update", "--scope", "user", CLAUDE_PLUGIN_ID],
      },
    ]);
  });

  it("skips cleanly in dry-run mode", () => {
    const packageRoot = makePackageRoot();

    const result = ensureClaudeCodeUserPlugin({
      options: { dryRun: true, overwrite: false },
      packageRoot,
      env: {},
      commandExists: () => true,
      runCommand: () => {
        throw new Error("should not run");
      },
    });

    expect(result).toEqual({ kind: "claude-plugin-skipped-dry-run", packageRoot });
  });

  it("skips inside a package lifecycle environment", () => {
    const packageRoot = makePackageRoot();
    const previousLifecycle = process.env.npm_lifecycle_event;
    process.env.npm_lifecycle_event = "postinstall";

    try {
      const result = ensureClaudeCodeUserPlugin({
        options: { dryRun: false, overwrite: false },
        packageRoot,
        env: { npm_lifecycle_event: "postinstall" },
        commandExists: () => true,
        runCommand: () => {
          throw new Error("should not run");
        },
      });

      expect(result).toEqual({ kind: "claude-plugin-skipped-package-lifecycle", packageRoot });
    } finally {
      if (previousLifecycle === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = previousLifecycle;
    }
  });

  it("returns a failing step when claude subcommands fail", () => {
    const packageRoot = makePackageRoot();

    const result = ensureClaudeCodeUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      env: {},
      commandExists: () => true,
      runCommand: (_command, args) => (args[1] === "install" ? 23 : 0),
    });

    expect(result).toEqual({
      kind: "claude-plugin-failed",
      packageRoot,
      pluginId: CLAUDE_PLUGIN_ID,
      step: "plugin-install",
      exitCode: 23,
    });
  });

  it("supports an env opt-out", () => {
    const packageRoot = makePackageRoot();
    process.env.WP_SKIP_CLAUDE_PLUGIN = "1";

    const result = ensureClaudeCodeUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      env: { WP_SKIP_CLAUDE_PLUGIN: "1" },
      commandExists: () => true,
      runCommand: () => {
        throw new Error("should not run");
      },
    });

    expect(result).toEqual({ kind: "claude-plugin-skipped-opt-out", packageRoot });
  });
});
