export declare const PLUGIN_CACHE_TARGETS: readonly [{
    readonly host: "claude";
    readonly rootParts: readonly [".claude", "plugins", "cache"];
}, {
    readonly host: "codex";
    readonly rootParts: readonly [".codex", "plugins", "cache"];
}, {
    readonly host: "opencode";
    readonly rootParts: readonly [".opencode", "plugins", "cache"];
}, {
    readonly host: "opencode";
    readonly rootParts: readonly [".config", "opencode", "plugins", "cache"];
}, {
    readonly host: "cursor";
    readonly rootParts: readonly [".cursor", "plugins", "cache"];
}, {
    readonly host: "windsurf";
    readonly rootParts: readonly [".windsurf", "plugins", "cache"];
}, {
    readonly host: "agents";
    readonly rootParts: readonly [".agents", "plugins", "cache"];
}, {
    readonly host: "factory";
    readonly rootParts: readonly [".factory", "plugins", "cache"];
}];
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
export declare function collectAgentKitPluginCacheEntries(homeDir?: string, hosts?: readonly PluginCacheHost[]): readonly HostPluginCachePruneResult[];
export declare function comparePluginVersions(left: string, right: string): number;
export declare function pruneOutdatedAgentKitPluginCaches(input: PrunePluginCachesInput): PluginCachePruneResult;
export declare function summarizePluginCachePrune(repoRoot: string, result: PluginCachePruneResult): readonly string[];
//# sourceMappingURL=plugin-cache-prune.d.ts.map