import type { RepoAuditResult } from "./repo-guardrails.js";
export declare const REFERENCE_PARITY_MATRIX_PATH = "docs/bench/reference-parity-matrix.md";
export declare const REQUIRED_REFERENCE_PARITY_CAPABILITIES: readonly ["lifecycle capture", "resume injection", "tool discovery", "indexed search", "routing injection", "pretool session redirect", "posttool broad capture", "registry/routing consistency", "repair path evidence", "host setup smoke", "benchmark thresholds", "release claim gating"];
export declare const REFERENCE_PARITY_COLUMNS: readonly ["capability", "host scope", "support level", "proof artifact", "required for release", "status"];
export type ReferenceParityCapability = (typeof REQUIRED_REFERENCE_PARITY_CAPABILITIES)[number];
export type ReferenceParityColumn = (typeof REFERENCE_PARITY_COLUMNS)[number];
export type ReferenceParitySupportLevel = "full" | "degraded" | "unsupported";
export type ReferenceParityStatus = "passed" | "open" | "blocked";
export interface ReferenceParityRow {
    capability: string;
    hostScope: string;
    supportLevel: ReferenceParitySupportLevel;
    proofArtifact: string;
    requiredForRelease: boolean;
    status: ReferenceParityStatus;
}
export interface ReferenceParityMatrixAuditResult extends RepoAuditResult {
    rows: ReferenceParityRow[];
    releaseClaimGateReady: boolean;
}
export interface ReferenceParityMatrixAuditOptions {
    /**
     * The default audit validates matrix shape and proof artifacts. Strict mode
     * additionally fails while release-required rows remain open or degraded so
     * public replacement-parity claims cannot ship on schema-only proof.
     */
    requireReleaseReady?: boolean;
}
export declare function auditReferenceParityMatrix(rootDirectory?: string, relativePath?: string, options?: ReferenceParityMatrixAuditOptions): ReferenceParityMatrixAuditResult;
//# sourceMappingURL=reference-parity-matrix.d.ts.map