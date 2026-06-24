export interface ConsumerPackageInfo {
    name: string;
    version?: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}
export interface WorkspacePackageInfo {
    name: string;
    relativePath: string;
    absolutePath: string;
    shortName: string;
}
export interface ConsumerContext {
    repoRoot: string;
    packageJsonPath: string | null;
    packageJson: ConsumerPackageInfo | null;
    hasPnpmWorkspace: boolean;
    workspacePackages: WorkspacePackageInfo[];
}
export declare function findGitRoot(startDir: string): string | null;
export declare function readPackageJson(repoRoot: string): {
    path: string | null;
    info: ConsumerPackageInfo | null;
};
/**
 * Parse `pnpm-workspace.yaml` enough to extract the `packages:` glob list.
 * We avoid pulling in a YAML dep for this — the file format is stable and
 * we only need the `packages:` block.
 */
export declare function parseWorkspaceGlobs(repoRoot: string): string[] | null;
export declare function discoverWorkspacePackages(repoRoot: string, globs: string[] | null): WorkspacePackageInfo[];
/**
 * Soft warning for the published-consumer install contract. Consumers run the
 * global `wp` binary and depend on `@webpresso/agent-config` for local
 * presets. Source/JIT mode is reserved for this repo via `WP_FORCE_SOURCE=1`.
 */
export declare function warnIfNonLocalCli(repoRoot: string, cliUrl?: string): void;
/**
 * agent-kit's own package name — the source repo for every agent-surface
 * template (`catalog/`, the tracked `.agent/`/`.claude/` surfaces). Scaffolding
 * into this repo overwrites the canonical sources, so `wp setup` refuses it
 * unless explicitly overridden. Only `@webpresso/agent-kit` hosts the catalog
 * templates.
 */
export { AGENT_KIT_PACKAGE_NAME } from './source-repo-hook-policy.js';
/** True when the consumer being scaffolded is agent-kit's own template-source repo. */
export declare function isAgentKitTemplateSourceRepo(packageName: string | undefined): boolean;
export declare function setupCommandForRepo(repoRoot: string, options?: {
    readonly restoreHooks?: boolean;
}): string;
export declare function detectConsumer(startDir?: string): ConsumerContext | null;
//# sourceMappingURL=detect-consumer.d.ts.map