export interface RepoAuditViolation {
    file?: string;
    message: string;
}
export interface RepoAuditResult {
    ok: boolean;
    title: string;
    checked: number;
    violations: RepoAuditViolation[];
}
export interface CatalogDriftOptions {
    workspaceFile?: string;
}
export interface DocsFrontmatterOptions {
    docsRoot?: string;
    allowedTypes?: readonly string[];
    folderTypes?: Readonly<Record<string, string>>;
    fix?: boolean;
    today?: string;
}
export interface BlueprintLifecycleOptions {
    blueprintsRoot?: string;
    statuses?: readonly string[];
    includeLegacyOmx?: boolean;
}
export interface CommitMessageOptions {
    allowedTypes?: readonly string[];
    loreWarn?: boolean;
    requireLore?: boolean;
    subjectMaxLength?: number;
}
export declare function auditCatalogDrift(rootDirectory?: string, options?: CatalogDriftOptions): RepoAuditResult;
export declare function validateCommitMessage(message: string, options?: CommitMessageOptions): RepoAuditResult;
export declare function auditCommitMessageFile(messageFile: string, options?: CommitMessageOptions): RepoAuditResult;
export declare function auditDocsFrontmatter(rootDirectory?: string, options?: DocsFrontmatterOptions): RepoAuditResult;
export declare function auditBlueprintLifecycle(rootDirectory?: string, options?: BlueprintLifecycleOptions): RepoAuditResult;
export declare function formatRepoAuditReport(auditResult: RepoAuditResult): string;
export declare function parseFrontmatter(markdown: string): Record<string, string>;
export interface NoRelativeParentImportsOptions {
    srcDir?: string;
    extensions?: readonly string[];
}
/**
 * Fail if any source file contains relative parent imports (`../`).
 * Use `#alias` package imports instead.
 */
export declare function auditNoRelativeParentImports(root: string, options?: NoRelativeParentImportsOptions): RepoAuditResult;
//# sourceMappingURL=repo-guardrails.d.ts.map