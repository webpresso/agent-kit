import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { CODEX_PLUGIN_ID, buildCodexStagingMarketplace, ensureCodexUserPlugin } from "./index.js";

const tempRoots: string[] = [];
const PLUGIN_VERSION = "1.2.3";

function makePackageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-codex-plugin-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".codex-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "agent-kit", version: PLUGIN_VERSION }) + "\n",
    "utf8",
  );
  return root;
}

function makePackageRootWithoutVersion(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-codex-plugin-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".codex-plugin"), { recursive: true });
  writeFileSync(join(root, ".codex-plugin", "plugin.json"), '{"name":"agent-kit"}\n', "utf8");
  return root;
}

function makeStagingRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-codex-staging-"));
  tempRoots.push(root);
  return root;
}

function installedPluginListJson(version = PLUGIN_VERSION): string {
  return (
    JSON.stringify({
      installed: [
        {
          pluginId: CODEX_PLUGIN_ID,
          name: "agent-kit",
          marketplaceName: "webpresso",
          version,
          installed: true,
          enabled: true,
        },
      ],
      available: [],
    }) + "\n"
  );
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  delete process.env.WP_SKIP_CODEX_PLUGIN;
});

describe("buildCodexStagingMarketplace", () => {
  it("symlinks plugins/agent-kit to the package and writes an object-source marketplace", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();

    buildCodexStagingMarketplace(stagingRoot, packageRoot);

    const link = join(stagingRoot, "plugins", "agent-kit");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(existsSync(join(link, ".codex-plugin", "plugin.json"))).toBe(true);

    const marketplace = JSON.parse(
      readFileSync(join(stagingRoot, ".agents", "plugins", "marketplace.json"), "utf8"),
    ) as {
      name: string;
      plugins: Array<{ name: string; source: { source: string; path: string } }>;
    };
    expect(marketplace.name).toBe("webpresso");
    expect(marketplace.plugins[0]?.source).toStrictEqual({
      source: "local",
      path: "./plugins/agent-kit",
    });
  });

  it("refreshes the symlink on re-run (idempotent)", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();

    buildCodexStagingMarketplace(stagingRoot, packageRoot);
    buildCodexStagingMarketplace(stagingRoot, packageRoot);

    expect(lstatSync(join(stagingRoot, "plugins", "agent-kit")).isSymbolicLink()).toBe(true);
  });
});

describe("ensureCodexUserPlugin", () => {
  it("builds the staging marketplace then runs marketplace add + plugin add", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    const configPath = join(stagingRoot, "config.toml");
    const calls: Array<{ command: string; args: readonly string[] }> = [];

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      configPath,
      env: {},
      commandExists: () => true,
      runCommand: (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-installed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
    });
    expect(calls).toEqual([
      { command: "codex", args: ["plugin", "marketplace", "remove", "webpresso", "--json"] },
      { command: "codex", args: ["plugin", "marketplace", "add", stagingRoot, "--json"] },
      {
        command: "codex",
        args: ["plugin", "list", "--marketplace", "webpresso", "--json"],
      },
      {
        command: "codex",
        args: ["plugin", "add", "agent-kit", "--marketplace", "webpresso", "--json"],
      },
    ]);
    // staging artifacts were materialized
    expect(lstatSync(join(stagingRoot, "plugins", "agent-kit")).isSymbolicLink()).toBe(true);
  });

  it("skips when the .codex-plugin manifest is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-codex-plugin-bare-"));
    tempRoots.push(root);

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot: root,
      env: {},
      commandExists: () => true,
      runCommand: () => {
        throw new Error("should not run");
      },
    });

    expect(result).toEqual({ kind: "codex-plugin-unavailable", packageRoot: root });
  });

  it("skips cleanly in dry-run mode", () => {
    const packageRoot = makePackageRoot();

    const result = ensureCodexUserPlugin({
      options: { dryRun: true, overwrite: false },
      packageRoot,
      env: {},
      commandExists: () => true,
      runCommand: () => {
        throw new Error("should not run");
      },
    });

    expect(result).toEqual({ kind: "codex-plugin-skipped-dry-run", packageRoot });
  });

  it("skips when codex is not on PATH", () => {
    const packageRoot = makePackageRoot();

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      env: {},
      commandExists: () => false,
      runCommand: () => {
        throw new Error("should not run");
      },
    });

    expect(result).toEqual({ kind: "codex-plugin-skipped-no-cli", packageRoot });
  });

  it("returns a failing step when plugin add fails", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    const configPath = join(stagingRoot, "config.toml");

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      configPath,
      env: {},
      commandExists: () => true,
      // 'remove' and 'marketplace add' succeed; the plugin add command fails.
      runCommand: (_command, args) => ({
        exitCode: args[1] === "add" && args[2] === "agent-kit" ? 17 : 0,
      }),
    });

    expect(result).toEqual({
      kind: "codex-plugin-failed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
      step: "plugin-add",
      exitCode: 17,
    });
  });

  it("skips plugin add when plugin list already confirms the expected version is installed", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    const calls: Array<{
      command: string;
      args: readonly string[];
      options?: { timeoutMs?: number };
    }> = [];

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      env: {},
      commandExists: () => true,
      runCommand: (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === "plugin" && args[1] === "list") {
          return { exitCode: 0, stdout: installedPluginListJson() };
        }
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-installed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
    });
    expect(calls).toEqual([
      { command: "codex", args: ["plugin", "marketplace", "remove", "webpresso", "--json"] },
      { command: "codex", args: ["plugin", "marketplace", "add", stagingRoot, "--json"] },
      {
        command: "codex",
        args: ["plugin", "list", "--marketplace", "webpresso", "--json"],
        options: { timeoutMs: 2000 },
      },
    ]);
  });

  it("continues to plugin add when plugin list shows a stale version", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    const calls: Array<readonly string[]> = [];

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      env: {},
      commandExists: () => true,
      runCommand: (_command, args) => {
        calls.push(args);
        if (args[0] === "plugin" && args[1] === "list") {
          return { exitCode: 0, stdout: installedPluginListJson("0.0.1") };
        }
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-installed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
    });
    expect(calls).toContainEqual([
      "plugin",
      "add",
      "agent-kit",
      "--marketplace",
      "webpresso",
      "--json",
    ]);
  });

  it("continues to plugin add when plugin list times out", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    const calls: Array<readonly string[]> = [];

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      env: {},
      commandExists: () => true,
      runCommand: (_command, args) => {
        calls.push(args);
        if (args[0] === "plugin" && args[1] === "list") {
          return { exitCode: 0, timedOut: true, stdout: installedPluginListJson() };
        }
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-installed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
    });
    expect(calls).toContainEqual([
      "plugin",
      "add",
      "agent-kit",
      "--marketplace",
      "webpresso",
      "--json",
    ]);
  });

  it("continues to plugin add when the expected manifest version is unavailable", () => {
    const packageRoot = makePackageRootWithoutVersion();
    const stagingRoot = makeStagingRoot();
    const calls: Array<readonly string[]> = [];

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      env: {},
      commandExists: () => true,
      runCommand: (_command, args) => {
        calls.push(args);
        if (args[0] === "plugin" && args[1] === "list") {
          return { exitCode: 0, stdout: installedPluginListJson() };
        }
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-installed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
    });
    expect(calls).toContainEqual([
      "plugin",
      "add",
      "agent-kit",
      "--marketplace",
      "webpresso",
      "--json",
    ]);
  });

  it("supports an env opt-out", () => {
    const packageRoot = makePackageRoot();
    process.env.WP_SKIP_CODEX_PLUGIN = "1";

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      env: { WP_SKIP_CODEX_PLUGIN: "1" },
      commandExists: () => true,
      runCommand: () => {
        throw new Error("should not run");
      },
    });

    expect(result).toEqual({ kind: "codex-plugin-skipped-opt-out", packageRoot });
  });

  it("skips inside a package lifecycle environment", () => {
    const packageRoot = makePackageRoot();
    const previousLifecycle = process.env.npm_lifecycle_event;
    process.env.npm_lifecycle_event = "postinstall";

    try {
      const result = ensureCodexUserPlugin({
        options: { dryRun: false, overwrite: false },
        packageRoot,
        env: { npm_lifecycle_event: "postinstall" },
        commandExists: () => true,
        runCommand: () => {
          throw new Error("should not run");
        },
      });

      expect(result).toEqual({ kind: "codex-plugin-skipped-package-lifecycle", packageRoot });
    } finally {
      if (previousLifecycle === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = previousLifecycle;
    }
  });

  it("refreshes plugin installation even when an enabled config block already exists", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    const configPath = join(stagingRoot, "config.toml");
    writeFileSync(configPath, '[plugins."agent-kit@webpresso"]\nenabled = true\n', "utf8");
    const calls: Array<{ command: string; args: readonly string[] }> = [];

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      configPath,
      env: {},
      commandExists: () => true,
      runCommand: (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-installed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
    });
    expect(calls).toEqual([
      { command: "codex", args: ["plugin", "marketplace", "remove", "webpresso", "--json"] },
      { command: "codex", args: ["plugin", "marketplace", "add", stagingRoot, "--json"] },
      {
        command: "codex",
        args: ["plugin", "list", "--marketplace", "webpresso", "--json"],
      },
      {
        command: "codex",
        args: ["plugin", "add", "agent-kit", "--marketplace", "webpresso", "--json"],
      },
    ]);
  });

  it("returns a timeout result when plugin add stalls", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    const configPath = join(stagingRoot, "config.toml");

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      configPath,
      env: {},
      commandExists: () => true,
      runCommand: (_command, args) => {
        if (args[0] === "plugin" && args[1] === "add") {
          return { exitCode: 124, timedOut: true };
        }
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-timed-out",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
      step: "plugin-add",
      timeoutMs: 8000,
    });
  });

  it("reports installed when post-timeout plugin list verifies the expected version", () => {
    const packageRoot = makePackageRoot();
    const stagingRoot = makeStagingRoot();
    let listCalls = 0;

    const result = ensureCodexUserPlugin({
      options: { dryRun: false, overwrite: false },
      packageRoot,
      stagingRoot,
      env: {},
      commandExists: () => true,
      runCommand: (_command, args) => {
        if (args[0] === "plugin" && args[1] === "list") {
          listCalls += 1;
          return {
            exitCode: 0,
            stdout: listCalls === 1 ? installedPluginListJson("0.0.1") : installedPluginListJson(),
          };
        }
        if (args[0] === "plugin" && args[1] === "add") {
          return { exitCode: 124, timedOut: true };
        }
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({
      kind: "codex-plugin-installed",
      packageRoot,
      pluginId: CODEX_PLUGIN_ID,
      stagingRoot,
    });
  });
});
