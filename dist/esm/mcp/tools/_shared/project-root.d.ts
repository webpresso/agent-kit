/**
 * Resolve the agent-kit MCP server's *project* root.
 *
 * Why this exists: Claude Code does NOT set a reliable cwd for plugin-scope
 * MCP servers (anthropics/claude-code#42687, #17565, #19205). User-scope
 * plugin servers see `process.cwd()` set to the plugin cache path; the
 * `cwd` field in `.mcp.json` is documented but ignored. So `tsc` and
 * `oxlint` spawned with the inherited cwd would lint the wrong tree.
 *
 * Resolution order, first hit wins:
 *   1. `CLAUDE_PROJECT_DIR` env var (when set by Claude Code hooks).
 *   2. Walk up from `process.cwd()` looking for a marker:
 *      `.git`, `pnpm-workspace.yaml`, then `package.json`.
 *   3. Loud throw — diagnosing a wrong-tree lint silently is worse than
 *      forcing the caller to pass an explicit cwd.
 *
 * The walk searches `.git` and `pnpm-workspace.yaml` *before* `package.json`
 * so we anchor at the workspace root rather than at a nested package dir.
 */
export declare class ProjectRootNotFoundError extends Error {
    constructor(startedAt: string);
}
export interface ResolveProjectRootOptions {
    readonly explicitCwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly cwd?: string;
}
export declare function resolveProjectRoot(options?: ResolveProjectRootOptions): string;
//# sourceMappingURL=project-root.d.ts.map