/** Markers that unambiguously identify a repo root. */
export declare const REPO_ROOT_MARKERS: readonly ["pnpm-workspace.yaml", ".git"];
/**
 * Legacy single-marker export. Retained for backwards compat with callers
 * that still reference it; new code should use REPO_ROOT_MARKERS or
 * findRepoRoot().
 */
export declare const REPO_ROOT_MARKER: "pnpm-workspace.yaml";
export declare function findRepoRoot(startDir?: string): string;
//# sourceMappingURL=repo-root.d.ts.map