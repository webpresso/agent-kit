import type { RepoAuditResult } from './repo-guardrails.js';
export interface BlueprintReadmeDriftOptions {
    fix?: boolean;
}
export declare function refreshBlueprintReadmeIndex(cwd?: string): void;
export declare function auditBlueprintReadmeDrift(cwd?: string, options?: BlueprintReadmeDriftOptions): RepoAuditResult;
//# sourceMappingURL=blueprint-readme-drift.d.ts.map