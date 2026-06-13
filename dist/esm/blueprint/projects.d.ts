/**
 * Project / worktree discovery for the structured-blueprint MCP surface.
 *
 * Owns one reusable, lazy, injectable resolver that returns
 * `BlueprintProjectRef[]` aggregated across five sources, in priority order:
 *
 *   1. Current project (`cwd`, `CLAUDE_PROJECT_DIR`, upward marker walk via
 *      the shared `resolveProjectRoot`).
 *   2. MCP client roots via `Server.listRoots()` — gracefully handles the
 *      `assertClientCapability` throw when the client did not advertise the
 *      roots capability.
 *   3. Static workspace config from `~/.agent/workspace.yaml` (read via the
 *      existing `getWorkspaceRepos` helper).
 *   4. Git worktrees parsed by the already-exported `parseWorktreePorcelain`
 *      from `#cli/commands/worktree/router-dispatch.ts` (do NOT duplicate).
 *   5. Bounded recursive scan (only when explicit roots are supplied) capped
 *      at `depth ≤ 3`, `count ≤ 200`, `timeoutMs 2000`, ignoring well-known
 *      build/cache directories and dotfiles other than `.agent`.
 *
 * No persistent registry, daemon, or background indexer. All filesystem and
 * git access is funnelled through an injectable `GitProbe` so tests run with
 * deterministic stubs and never spawn real git.
 *
 * **`project_id_v1` spec (F14):**
 *   `project_id = sha256(realpath(worktree) + '\0' + (repo_common_dir ?? '') + '\0' + os.platform()).hex().slice(0, 16)`
 *
 * - `realpath` may case-fold on macOS APFS — accepted and documented.
 * - Moving a worktree changes the id (by design).
 * - Recreating a worktree at the same path reuses the id — clients must use
 *   `branch` + HEAD commit as the freshness signal.
 */
export { parseWorktreePorcelain } from '#cli/commands/worktree/router-dispatch';
export declare const PROJECT_SOURCES: {
    readonly current: "current";
    readonly mcp_roots: "mcp_roots";
    readonly workspace_config: "workspace_config";
    readonly git_worktree: "git_worktree";
    readonly recursive_scan: "recursive_scan";
};
export type ProjectSource = (typeof PROJECT_SOURCES)[keyof typeof PROJECT_SOURCES];
export interface BlueprintProjectRef {
    readonly project_id: string;
    readonly label: string;
    readonly repo_path: string;
    readonly worktree_path: string;
    readonly repo_key?: string;
    readonly worktree_key?: string;
    readonly source: ProjectSource;
    readonly branch?: string;
    readonly has_blueprints: boolean;
    readonly db_path: string;
    readonly stale?: boolean;
}
export interface RootsResponse {
    readonly roots: ReadonlyArray<{
        readonly uri: string;
        readonly name?: string;
    }>;
}
export type RootsProvider = () => Promise<RootsResponse>;
export interface GitProbe {
    isGitRepo: (cwd: string) => boolean;
    repoToplevel: (cwd: string) => string | null;
    repoCommonDir: (cwd: string) => string | null;
    listWorktreesPorcelain: (cwd: string) => string;
    headBranch: (cwd: string) => string | null;
    platform: () => NodeJS.Platform;
}
export interface RecursiveScanLimits {
    readonly depth: number;
    readonly count: number;
    readonly timeoutMs: number;
}
export declare const RECURSIVE_SCAN_LIMITS: RecursiveScanLimits;
export declare const GIT_DISCOVERY_TIMEOUT_MS = 100;
export declare const RECURSIVE_SCAN_IGNORED_DIRS: ReadonlySet<string>;
export interface ResolveBlueprintProjectsOptions {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly rootsProvider?: RootsProvider;
    readonly workspaceRepos?: ReadonlyArray<string>;
    readonly recursiveScanRoots?: ReadonlyArray<string>;
    readonly caps?: RecursiveScanLimits;
    readonly git?: GitProbe;
    readonly now?: () => number;
}
/**
 * Pinned `project_id_v1` formula.
 *
 * Inputs are taken at the `realpath` boundary by the caller, not inside the
 * hasher; that keeps the hash a pure function of its arguments and lets tests
 * exercise platform-folding behavior without touching the filesystem.
 */
export declare function projectIdV1(worktreePath: string, repoCommonDir: string | undefined, platformValue: NodeJS.Platform): string;
export declare function resolveBlueprintProjects(options?: ResolveBlueprintProjectsOptions): Promise<BlueprintProjectRef[]>;
//# sourceMappingURL=projects.d.ts.map