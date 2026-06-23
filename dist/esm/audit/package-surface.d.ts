import type { RepoAuditResult } from './repo-guardrails.js';
interface PackedFileRecord {
    path: string;
    size?: number;
    mode?: number;
}
interface NpmPackDryRunEntry {
    files?: PackedFileRecord[];
    size?: number;
    unpackedSize?: number;
}
interface PackageSurfaceAuditOptions {
    readPackedEntry?: (packageRoot: string) => NpmPackDryRunEntry;
    runSecretlint?: (stageRoot: string, packageRoot: string) => unknown;
}
export declare function auditPackageSurface(rootDirectory?: string, options?: PackageSurfaceAuditOptions): RepoAuditResult;
export declare function stagePublishableTarballSurface(rootDirectory: string, destinationDirectory: string, options?: PackageSurfaceAuditOptions): {
    packageCount: number;
    fileCount: number;
};
export declare function parseNpmPackJsonOutput(raw: string): unknown;
export {};
//# sourceMappingURL=package-surface.d.ts.map