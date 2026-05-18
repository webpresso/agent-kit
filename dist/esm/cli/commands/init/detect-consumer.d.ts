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
 * Soft warning when the running CLI does not resolve to the consumer's local
 * `@webpresso/agent-kit` install. Catches the global-install / pnpm-link / npx
 * case where `ak setup` succeeds against the executing CLI's catalog but
 * produces a non-reproducible `.agents/skills/` tree (symlinks point outside
 * the project tree; lockfile irrelevant). Repo-local symlink/dev-link installs
 * still count as local via realpath comparison. Self-mode short-circuits when
 * the consumer IS `@webpresso/agent-kit` (running setup from agent-kit's own
 * checkout).
 *
 * Non-blocking: prints to stderr and returns. The bc88-class failure
 * (catalog truly missing) is caught by the catch-wrap in `runInit` via
 * `loadContent`'s throw — this is the orthogonal silent-non-determinism
 * class that the catch-wrap doesn't surface.
 */
export declare function warnIfNonLocalCli(repoRoot: string, cliUrl?: string): void;
export declare function detectConsumer(startDir?: string): ConsumerContext | null;
//# sourceMappingURL=detect-consumer.d.ts.map