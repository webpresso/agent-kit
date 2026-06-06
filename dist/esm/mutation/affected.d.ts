/**
 * Run Stryker only on packages changed vs. the base branch.
 * Returns 0 on success, 1 if any package fails its break threshold.
 *
 * Reads GITHUB_BASE_REF (set by GitHub Actions on pull_request events) to
 * determine the base branch; falls back to "main".
 */
export declare function runAffectedMutation(): 0 | 1;
//# sourceMappingURL=affected.d.ts.map