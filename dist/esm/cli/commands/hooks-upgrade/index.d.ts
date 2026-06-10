import type { MergeResult } from '#cli/commands/init/merge.js';
export interface HooksUpgradeCommandDeps {
    readonly cwd?: string;
    readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
    readonly trustCodexHooks?: boolean;
    readonly workspaceRepos?: readonly string[];
}
export interface HooksUpgradeTargetReport {
    readonly repoRoot: string;
    readonly mode: 'single' | 'workspace';
    readonly apply: boolean;
    readonly results: readonly MergeResult[];
    readonly warnings: readonly string[];
    readonly beforeSummary: string;
    readonly projectedSummary: string;
}
export declare function upgradeHooksForRepo(repoRoot: string, options: {
    apply: boolean;
    trustCodexHooks: boolean;
}): Promise<HooksUpgradeTargetReport>;
export declare function hooksUpgradeCommand(argv: readonly string[], deps?: HooksUpgradeCommandDeps): Promise<number>;
//# sourceMappingURL=index.d.ts.map