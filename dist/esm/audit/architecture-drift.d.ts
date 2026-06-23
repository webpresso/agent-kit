import type { RepoAuditResult } from './repo-guardrails.js';
export interface ArchitectureDriftRule {
    id: string;
    description?: string;
    paths: readonly string[];
    mustContain?: readonly string[];
    mustNotContain?: readonly string[];
    allowMissing?: boolean;
    caseSensitive?: boolean;
}
export interface ArchitectureBlueprintPolicy {
    enabled?: boolean;
    blueprintGlobs?: readonly string[];
    architectureDocGlobs?: readonly string[];
    requireArchitectureLinks?: boolean;
    requireBeforeAfterWhenArchitectureChanging?: boolean;
    architectureChangeMarkers?: readonly string[];
    beforeHeading?: string;
    afterHeading?: string;
    exemptStatuses?: readonly string[];
}
export interface ArchitectureDriftContract {
    version: 1;
    architectureDocs?: readonly string[];
    requiredFiles?: readonly string[];
    rules?: readonly ArchitectureDriftRule[];
    blueprintPolicy?: ArchitectureBlueprintPolicy;
}
export interface ArchitectureDriftOptions {
    contractPath?: string;
}
export declare function auditArchitectureDrift(rootDirectory?: string, options?: ArchitectureDriftOptions): RepoAuditResult;
//# sourceMappingURL=architecture-drift.d.ts.map