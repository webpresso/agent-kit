import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pruneOutdatedAgentKitPluginCaches } from "./plugin-cache-prune.js";

function makeTempDir(): string {
  return join(
    tmpdir(),
    `plugin-cache-prune-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

function hostCacheRoot(homeDir: string, host: "claude" | "codex" | "opencode" | "cursor"): string {
  if (host === "opencode") return join(homeDir, ".config", "opencode", "plugins", "cache");
  return join(homeDir, `.${host}`, "plugins", "cache");
}

function writeCacheVersion(
  homeDir: string,
  host: "claude" | "codex" | "opencode" | "cursor",
  marketplace: string,
  version: string,
  skill = "fix",
): string {
  const dir = join(hostCacheRoot(homeDir, host), marketplace, "agent-kit", version);
  mkdirSync(join(dir, "skills", skill), { recursive: true });
  writeFileSync(
    join(dir, "skills", skill, "SKILL.md"),
    `---
name: ${skill}
version: ${version}
---
`,
  );
  return dir;
}

describe("plugin cache prune", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = makeTempDir();
    mkdirSync(homeDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("prunes stale agent-kit plugin cache versions across supported cache roots", () => {
    const oldClaude = writeCacheVersion(homeDir, "claude", "webpresso", "0.34.5");
    const legacyClaude = writeCacheVersion(homeDir, "claude", "agent-kit", "0.8.1");
    const currentClaude = writeCacheVersion(homeDir, "claude", "webpresso", "1.1.0");
    const oldCodex = writeCacheVersion(homeDir, "codex", "webpresso", "0.34.5");
    const currentCodex = writeCacheVersion(homeDir, "codex", "webpresso", "1.1.0");
    const oldOpenCode = writeCacheVersion(homeDir, "opencode", "webpresso", "0.34.5");
    const currentOpenCode = writeCacheVersion(homeDir, "opencode", "webpresso", "1.1.0");
    const oldCursor = writeCacheVersion(homeDir, "cursor", "webpresso", "0.34.5");
    const currentCursor = writeCacheVersion(homeDir, "cursor", "webpresso", "1.1.0");

    const result = pruneOutdatedAgentKitPluginCaches({ homeDir, currentVersion: "1.1.0" });
    const existingRootResults = result.results.filter((host) => !host.missing);

    expect(existingRootResults.map((host) => [host.host, host.pruned.length])).toEqual([
      ["claude", 2],
      ["codex", 1],
      ["opencode", 1],
      ["cursor", 1],
    ]);
    expect(existsSync(oldClaude)).toBe(false);
    expect(existsSync(legacyClaude)).toBe(false);
    expect(existsSync(oldCodex)).toBe(false);
    expect(existsSync(oldOpenCode)).toBe(false);
    expect(existsSync(oldCursor)).toBe(false);
    expect(existsSync(currentClaude)).toBe(true);
    expect(existsSync(currentCodex)).toBe(true);
    expect(existsSync(currentOpenCode)).toBe(true);
    expect(existsSync(currentCursor)).toBe(true);
  });

  it("removes stale Claude/Codex agent-kit skill caches so 2.3.3 cannot shadow 2.4.0", () => {
    const staleClaude = writeCacheVersion(homeDir, "claude", "webpresso", "2.3.3", "claude");
    const currentClaude = writeCacheVersion(homeDir, "claude", "webpresso", "2.4.0", "claude");
    const staleCodex = writeCacheVersion(homeDir, "codex", "webpresso", "2.3.3", "claude");
    const currentCodex = writeCacheVersion(homeDir, "codex", "webpresso", "2.4.0", "claude");

    const result = pruneOutdatedAgentKitPluginCaches({
      homeDir,
      currentVersion: "2.4.0",
      hosts: ["claude", "codex"],
    });

    expect(
      result.results.map((host) => [host.host, host.kept.map((entry) => entry.version)]),
    ).toEqual([
      ["claude", ["2.4.0"]],
      ["codex", ["2.4.0"]],
    ]);
    expect(
      result.results.map((host) => [host.host, host.pruned.map((entry) => entry.version)]),
    ).toEqual([
      ["claude", ["2.3.3"]],
      ["codex", ["2.3.3"]],
    ]);
    expect(existsSync(join(staleClaude, "skills", "claude", "SKILL.md"))).toBe(false);
    expect(existsSync(join(staleCodex, "skills", "claude", "SKILL.md"))).toBe(false);
    expect(existsSync(join(currentClaude, "skills", "claude", "SKILL.md"))).toBe(true);
    expect(existsSync(join(currentCodex, "skills", "claude", "SKILL.md"))).toBe(true);
  });

  it("prunes stale nested temporary agent-kit cache copies", () => {
    const staleBackup = writeCacheVersion(
      homeDir,
      "codex",
      join("webpresso", "plugin-backup-stale"),
      "2.3.3",
      "claude",
    );
    const staleInstall = writeCacheVersion(
      homeDir,
      "codex",
      join("webpresso", "plugin-install-stale"),
      "2.3.2",
      "claude",
    );
    const currentCodex = writeCacheVersion(homeDir, "codex", "webpresso", "2.4.0", "claude");

    const result = pruneOutdatedAgentKitPluginCaches({
      homeDir,
      currentVersion: "2.4.0",
      hosts: ["codex"],
    });

    expect(result.results[0]?.kept.map((entry) => entry.path)).toEqual([currentCodex]);
    expect(result.results[0]?.pruned.map((entry) => entry.path)).toEqual([
      staleBackup,
      staleInstall,
    ]);
    expect(existsSync(join(staleBackup, "skills", "claude", "SKILL.md"))).toBe(false);
    expect(existsSync(join(staleInstall, "skills", "claude", "SKILL.md"))).toBe(false);
    expect(existsSync(join(currentCodex, "skills", "claude", "SKILL.md"))).toBe(true);
  });

  it("keeps the newest cache version when the current package version is not cached yet", () => {
    const oldest = writeCacheVersion(homeDir, "claude", "webpresso", "0.31.0");
    const newest = writeCacheVersion(homeDir, "claude", "webpresso", "0.34.5");

    const result = pruneOutdatedAgentKitPluginCaches({
      homeDir,
      currentVersion: "1.1.0",
      hosts: ["claude"],
    });

    expect(result.results[0]?.kept.map((entry) => entry.version)).toEqual(["0.34.5"]);
    expect(result.results[0]?.pruned.map((entry) => entry.version)).toEqual(["0.31.0"]);
    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(newest)).toBe(true);
  });

  it("does not delete cache versions in dry-run mode", () => {
    const oldClaude = writeCacheVersion(homeDir, "claude", "webpresso", "0.34.5");
    const currentClaude = writeCacheVersion(homeDir, "claude", "webpresso", "1.1.0");

    const result = pruneOutdatedAgentKitPluginCaches({
      homeDir,
      currentVersion: "1.1.0",
      dryRun: true,
      hosts: ["claude"],
    });

    expect(result.dryRun).toBe(true);
    expect(result.results[0]?.pruned.map((entry) => entry.version)).toEqual(["0.34.5"]);
    expect(existsSync(oldClaude)).toBe(true);
    expect(existsSync(currentClaude)).toBe(true);
  });
});
