import type { ConsumerContext, WorkspacePackageInfo } from './detect-consumer.js';
import { type MergeOptions, type MergeResult } from './merge.js';
export interface ScaffoldMonorepoNavInput {
    catalogDir: string;
    repoRoot: string;
    consumer: ConsumerContext;
    options: MergeOptions;
}
export declare function renderPackagesTable(packages: readonly WorkspacePackageInfo[]): string;
/**
 * Infer coarse key locations from package naming. Always leaves a TODO so
 * the human can refine. Never fabricates paths — only reports what we saw.
 */
export declare function renderKeyLocations(packages: readonly WorkspacePackageInfo[]): string;
export declare function renderCrossPackageImports(packages: readonly WorkspacePackageInfo[]): string;
export declare function renderPackageNames(packages: readonly WorkspacePackageInfo[]): string;
export declare function renderTemplate(template: string, consumer: ConsumerContext): string;
export declare function scaffoldMonorepoNav(input: ScaffoldMonorepoNavInput): MergeResult[];
//# sourceMappingURL=scaffold-monorepo-nav.d.ts.map