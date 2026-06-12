import type { RepoAuditResult } from '#audit/repo-guardrails';
export type AuditKind = 'tph' | 'tph-e2e' | 'bundle-budget' | 'commit-message' | 'blueprint-readme-drift' | 'blueprint-lifecycle' | 'roadmap-links' | 'docs-frontmatter' | 'catalog-drift' | 'package-surface' | 'agents' | 'tech-debt' | 'no-relative-parent-imports' | 'no-link-protocol' | 'vision' | 'bucket-boundary' | 'skill-sizes' | 'broken-refs' | 'memory-rotation' | 'gitignore-agent-surfaces' | 'memory-unified' | 'compile-drift' | 'architecture-drift' | 'cloudflare-deploy-contract' | 'toolchain-isolation' | 'absolute-path-policy' | 'no-first-party-mjs' | 'agent-cost' | 'blueprint-db-consistency' | 'tech-debt-cadence' | 'cross-repo-correlation' | 'ai-contracts' | 'mutation' | 'quality' | 'guardrails' | 'hook-surface' | 'hook-vendor-drift' | 'no-relative-package-scripts' | 'secrets-policy' | 'no-dev-vars' | 'secret-provider-quarantine' | 'secrets-config';
export type AuditOutcome = {
    kind: 'invalid-usage';
    message: string;
} | {
    kind: 'unknown-kind';
    auditKind: string;
} | {
    kind: 'script-exit';
    code: number;
} | {
    kind: 'repo-result';
    name: string;
    result: RepoAuditResult;
} | {
    kind: 'aggregate-result';
    code: number;
    results: ReadonlyArray<{
        name: string;
        result: RepoAuditResult;
    }>;
} | {
    kind: 'quality-exit';
    code: number;
    mutationCode: number;
    guardrailsCode: number;
};
export interface AuditActionOptions {
    changedOnly?: boolean;
    dist?: string;
    docsRoot?: string;
    fix?: boolean;
    htmlEntry?: string;
    ignore?: string | string[];
    json?: boolean;
    omxPlans?: boolean;
    loreWarn?: boolean;
    maxHtmlEagerJsAssetBytes?: string;
    maxHtmlEagerJsTotalBytes?: string;
    maxJsAssetBytes?: string;
    messageFile?: string;
    requireLore?: boolean;
    root?: string;
    staged?: boolean;
    strict?: boolean;
    visionPath?: string;
}
export interface AuditDeps {
    root: string;
    runStryker: (cwd: string) => Promise<number>;
    runRepoAudit: (name: string, root: string, options: AuditActionOptions) => Promise<RepoAuditResult> | RepoAuditResult;
    runBundleBudget: (args: string[]) => Promise<number>;
    runCommitMessageAudit: (messageFile: string, options: AuditActionOptions) => RepoAuditResult | Promise<RepoAuditResult>;
    buildBundleBudgetArgs: (target: string | undefined, options: AuditActionOptions) => string[];
    knownRepoKinds: readonly string[];
}
export declare function runAuditDispatch(auditKind: string | undefined, targets: string[], options: AuditActionOptions, deps: AuditDeps): Promise<AuditOutcome>;
//# sourceMappingURL=audit-core.d.ts.map