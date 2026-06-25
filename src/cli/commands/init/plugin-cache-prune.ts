import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";

export const PLUGIN_CACHE_TARGETS = [
  { host: "claude", rootParts: [".claude", "plugins", "cache"] },
  { host: "codex", rootParts: [".codex", "plugins", "cache"] },
  { host: "opencode", rootParts: [".opencode", "plugins", "cache"] },
  { host: "opencode", rootParts: [".config", "opencode", "plugins", "cache"] },
  { host: "cursor", rootParts: [".cursor", "plugins", "cache"] },
  { host: "windsurf", rootParts: [".windsurf", "plugins", "cache"] },
  { host: "agents", rootParts: [".agents", "plugins", "cache"] },
  { host: "factory", rootParts: [".factory", "plugins", "cache"] },
] as const;

export type PluginCacheHost = (typeof PLUGIN_CACHE_TARGETS)[number]["host"];

export interface PluginCacheEntry {
  readonly host: PluginCacheHost;
  readonly marketplace: string;
  readonly plugin: "agent-kit";
  readonly version: string;
  readonly path: string;
}

export interface PrunePluginCachesInput {
  readonly currentVersion: string;
  readonly homeDir?: string;
  readonly dryRun?: boolean;
  readonly hosts?: readonly PluginCacheHost[];
}

export interface HostPluginCachePruneResult {
  readonly host: PluginCacheHost;
  readonly cacheRoot: string;
  readonly scanned: number;
  readonly kept: readonly PluginCacheEntry[];
  readonly pruned: readonly PluginCacheEntry[];
  readonly missing: boolean;
}

export interface PluginCachePruneResult {
  readonly currentVersion: string;
  readonly dryRun: boolean;
  readonly results: readonly HostPluginCachePruneResult[];
}

function isDirectoryLike(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

export function collectAgentKitPluginCacheEntries(
  homeDir = homedir(),
  hosts?: readonly PluginCacheHost[],
): readonly HostPluginCachePruneResult[] {
  const selectedHosts = hosts ? new Set(hosts) : null;
  const results: HostPluginCachePruneResult[] = [];

  for (const target of PLUGIN_CACHE_TARGETS) {
    if (selectedHosts && !selectedHosts.has(target.host)) continue;
    const cacheRoot = join(homeDir, ...target.rootParts);
    const entries: PluginCacheEntry[] = [];
    if (!existsSync(cacheRoot)) {
      results.push({
        host: target.host,
        cacheRoot,
        scanned: 0,
        kept: [],
        pruned: [],
        missing: true,
      });
      continue;
    }

    const collectFromPluginDir = (marketplace: string, pluginDir: string): void => {
      if (!isDirectoryLike(pluginDir)) return;

      for (const versionDirent of readdirSync(pluginDir, { withFileTypes: true })) {
        if (!versionDirent.isDirectory() && !versionDirent.isSymbolicLink()) continue;
        const version = versionDirent.name;
        entries.push({
          host: target.host,
          marketplace,
          plugin: "agent-kit",
          version,
          path: join(pluginDir, version),
        });
      }
    };

    for (const marketplaceDirent of readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!marketplaceDirent.isDirectory() && !marketplaceDirent.isSymbolicLink()) continue;
      const marketplace = marketplaceDirent.name;
      const marketplaceRoot = join(cacheRoot, marketplace);
      collectFromPluginDir(marketplace, join(marketplaceRoot, "agent-kit"));

      for (const tempDirent of readdirSync(marketplaceRoot, { withFileTypes: true })) {
        if (
          !tempDirent.name.startsWith("plugin-backup-") &&
          !tempDirent.name.startsWith("plugin-install-")
        ) {
          continue;
        }
        if (!tempDirent.isDirectory() && !tempDirent.isSymbolicLink()) continue;
        collectFromPluginDir(
          `${marketplace}/${tempDirent.name}`,
          join(marketplaceRoot, tempDirent.name, "agent-kit"),
        );
      }
    }

    results.push({
      host: target.host,
      cacheRoot,
      scanned: entries.length,
      kept: entries,
      pruned: [],
      missing: false,
    });
  }

  return results;
}

function parseSemverPrefix(version: string): readonly [number, number, number, string] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ""] as const;
}

export function comparePluginVersions(left: string, right: string): number {
  const leftSemver = parseSemverPrefix(left);
  const rightSemver = parseSemverPrefix(right);
  if (leftSemver && rightSemver) {
    const [leftMajor, leftMinor, leftPatch] = leftSemver;
    const [rightMajor, rightMinor, rightPatch] = rightSemver;
    for (const [leftPart, rightPart] of [
      [leftMajor, rightMajor],
      [leftMinor, rightMinor],
      [leftPatch, rightPatch],
    ] as const) {
      const delta = leftPart - rightPart;
      if (delta !== 0) return delta;
    }
    // Prefer stable releases over prerelease/build suffixes when numeric parts tie.
    if (leftSemver[3] === "" && rightSemver[3] !== "") return 1;
    if (leftSemver[3] !== "" && rightSemver[3] === "") return -1;
    return leftSemver[3].localeCompare(rightSemver[3]);
  }
  if (leftSemver && !rightSemver) return 1;
  if (!leftSemver && rightSemver) return -1;
  return left.localeCompare(right, undefined, { numeric: true });
}

function newestVersion(entries: readonly PluginCacheEntry[]): string | null {
  let newest: string | null = null;
  for (const entry of entries) {
    if (newest === null || comparePluginVersions(entry.version, newest) > 0) {
      newest = entry.version;
    }
  }
  return newest;
}

function removeEmptyDir(path: string): void {
  try {
    if (readdirSync(path).length === 0) rmSync(path, { recursive: false });
  } catch {
    // Best-effort cleanup only; the cache version dir removal is the important part.
  }
}

export function pruneOutdatedAgentKitPluginCaches(
  input: PrunePluginCachesInput,
): PluginCachePruneResult {
  const homeDir = input.homeDir ?? homedir();
  const dryRun = input.dryRun === true;
  const collected = collectAgentKitPluginCacheEntries(homeDir, input.hosts);
  const results: HostPluginCachePruneResult[] = [];

  for (const hostResult of collected) {
    const entries = hostResult.kept;
    const hasCurrentVersion = entries.some((entry) => entry.version === input.currentVersion);
    const fallbackNewest = hasCurrentVersion ? input.currentVersion : newestVersion(entries);
    const keepVersions = new Set(fallbackNewest ? [fallbackNewest] : []);
    const kept = entries.filter((entry) => keepVersions.has(entry.version));
    const pruned = entries.filter((entry) => !keepVersions.has(entry.version));

    if (!dryRun) {
      for (const entry of pruned) {
        const pluginDir = dirname(entry.path);
        const marketplaceDir = dirname(pluginDir);
        rmSync(entry.path, { recursive: true, force: true });
        removeEmptyDir(pluginDir);
        removeEmptyDir(marketplaceDir);
      }
    }

    results.push({ ...hostResult, kept, pruned });
  }

  return { currentVersion: input.currentVersion, dryRun, results };
}

export function summarizePluginCachePrune(
  repoRoot: string,
  result: PluginCachePruneResult,
): readonly string[] {
  const totalPruned = result.results.reduce((sum, host) => sum + host.pruned.length, 0);
  const action = result.dryRun ? "would remove" : "removed";
  const lines = [`  plugin cache prune: ${action} ${totalPruned} outdated cache version(s)`];

  for (const host of result.results) {
    if (host.missing) continue;
    const keptVersions =
      [...new Set(host.kept.map((entry) => entry.version))].join(", ") || "(none)";
    lines.push(`    ${host.host}: ${action} ${host.pruned.length}; kept ${keptVersions}`);
    if (host.pruned.length > 0) {
      const prunedPaths = host.pruned
        .map((entry) => relative(repoRoot, entry.path).replaceAll("\\", "/"))
        .join(", ");
      lines.push(`      pruned: ${prunedPaths}`);
    }
  }

  return lines;
}
