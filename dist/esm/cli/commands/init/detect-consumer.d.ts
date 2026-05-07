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
export declare function detectConsumer(startDir?: string): ConsumerContext | null;
//# sourceMappingURL=detect-consumer.d.ts.map