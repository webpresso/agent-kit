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
    includeOmxPlans?: boolean;
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
export interface NoLinkProtocolOptions {
    workspaceFile?: string;
    extraPackageGlobs?: readonly string[];
}
/**
 * Fail if any package.json (root, workspaces, or named extras) declares a
 * `link:<filesystem-path>` value in `dependencies`, `devDependencies`,
 * `optionalDependencies`, or `pnpm.overrides`. `link:` filesystem-couples
 * consumer clones to a maintainer's directory layout and hides version-pin
 * drift; use `catalog:` (cross-repo) or `workspace:*` (intra-repo) instead.
 */
export declare function auditNoLinkProtocol(rootDirectory?: string, options?: NoLinkProtocolOptions): RepoAuditResult;
export interface NoRelativeParentImportsOptions {
    srcDir?: string;
    extensions?: readonly string[];
    /**
     * Skip the tsconfig*.json scan entirely. Off by default — tsconfig parent
     * paths (`extends`, `paths`, `references`, `include`, `outDir`, etc.) are
     * audited alongside source imports.
     */
    skipTsconfig?: boolean;
    /** Directory to start the tsconfig scan from. Defaults to the repo root. */
    tsconfigRoot?: string;
    /**
     * Subdirectory paths relative to `srcDir` to skip entirely. Use for
     * published config packages that rely on within-package relative imports
     * by design (e.g. `config/docs-lint`).
     */
    excludeDirs?: readonly string[];
}
/**
 * Fail if any source file contains relative parent imports (`../`) or if any
 * `tsconfig*.json` declares a parent-relative path. Use `#alias` package
 * imports for source code and a workspace path mapping / package alias for
 * tsconfig `extends`, `paths`, `references`, etc.
 */
export declare function auditNoRelativeParentImports(root: string, options?: NoRelativeParentImportsOptions): RepoAuditResult;
export interface TestIsolationOptions {
    /** Directory to scan for test files. Defaults to `src`. */
    srcDir?: string;
    /** Test-file suffixes to inspect. Defaults to `.test.ts` / `.test.tsx`. */
    extensions?: readonly string[];
}
/**
 * Fail if any `*.test.ts` reaches the repo's own `catalog/` template source
 * through `process.cwd()`. The catalog tree is the source of every
 * agent-surface template, so a `process.cwd()`-anchored path is both brittle
 * (it depends on the runner's working directory) and the exact pattern behind
 * the scaffold-agents-md footgun, where a test read the live
 * `catalog/AGENTS.md.tpl` off cwd. Anchor catalog reads to the package via the
 * import.meta-based `resolveCatalogDir()` helper instead, and write only into
 * `mkdtemp`/`tmpdir` sandboxes.
 */
export declare function auditTestIsolation(root: string, options?: TestIsolationOptions): RepoAuditResult;
export interface NoRelativePackageScriptsOptions {
    /** Glob-style subdirectory patterns relative to root to skip. */
    excludeDirs?: readonly string[];
}
/**
 * Fail if any `package.json#scripts` entry invokes a relative parent path
 * (`../`). Scripts should call workspace bins or registered CLI commands, not
 * path-relative sibling scripts — those break when packages move.
 *
 * @example bad  — "build": "node [dot-dot-dot]/scripts/foo.js"  (relative parent path)
 * @example good — "build": "pnpm --filter scripts foo"  or  "build": "wp build"
 */
export declare function auditNoRelativePackageScripts(root: string, options?: NoRelativePackageScriptsOptions): RepoAuditResult;
//# sourceMappingURL=repo-guardrails.d.ts.map