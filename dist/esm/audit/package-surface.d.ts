import type { RepoAuditResult } from './repo-guardrails.js';
export declare function auditPackageSurface(rootDirectory?: string): RepoAuditResult;
export declare function stagePublishableTarballSurface(rootDirectory: string, destinationDirectory: string): {
    packageCount: number;
    fileCount: number;
};
//# sourceMappingURL=package-surface.d.ts.map