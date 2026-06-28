import type { MergeResult } from "./merge.js";
export interface ScaffoldCatalogIgnoreOptions {
    cwd: string;
    catalogDir: string;
    dryRun?: boolean;
    overwrite?: boolean;
}
export interface ScaffoldCatalogIgnoreResult {
    results: readonly MergeResult[];
    skillNames: readonly string[];
    ruleNames: readonly string[];
}
export declare function scaffoldCatalogIgnore(opts: ScaffoldCatalogIgnoreOptions): ScaffoldCatalogIgnoreResult;
//# sourceMappingURL=scaffold-catalog-ignore.d.ts.map