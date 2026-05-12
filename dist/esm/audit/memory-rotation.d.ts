import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js';
export interface RotationLogEntry {
    timestamp: string;
    sectionSlug: string;
    sourcePath: string;
    archivedTo: string;
    reason: string;
}
export interface RotationEvent extends RotationLogEntry {
    acked: boolean;
    daysAgo: number;
}
export interface MemoryRotationResult {
    violations: RepoAuditViolation[];
    recentEvents: RotationEvent[];
    checked: number;
    pass: boolean;
}
export interface MemoryRotationOptions {
    windowDays?: number;
    strict?: boolean;
}
/**
 * Audit memory rotation log.
 */
export declare function auditMemoryRotation(cwd: string, options?: MemoryRotationOptions): MemoryRotationResult;
/**
 * Adapter to return a RepoAuditResult shape for registry integration.
 */
export declare function auditMemoryRotationAsRepoResult(cwd: string, options?: MemoryRotationOptions): RepoAuditResult;
//# sourceMappingURL=memory-rotation.d.ts.map