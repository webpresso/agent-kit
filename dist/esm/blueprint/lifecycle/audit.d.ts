export interface BlueprintAuditIssue {
    file?: string;
    level: 'error' | 'warning';
    message: string;
}
export interface BlueprintAuditResult {
    issues: BlueprintAuditIssue[];
    ok: boolean;
}
export interface RunBlueprintAuditOptions {
    all?: boolean;
    projectRoot: string;
    stagedFiles?: string[];
    strict?: boolean;
}
export declare function runBlueprintAudit(options: RunBlueprintAuditOptions): Promise<BlueprintAuditResult>;
//# sourceMappingURL=audit.d.ts.map