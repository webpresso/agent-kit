/**
 * Audit: No Ambient Root Resolution
 *
 * Pure detection function — no filesystem reads.
 * Given an array of {path, contents} file objects, detects patterns that
 * indicate ambient (implicit cwd-based) root resolution:
 *
 *   - calls to findRepoRoot(, findRootSync(, findProjectRoot(
 *   - top-level `const <X> = ...<anything containing Root>...()` assignments
 *   - `= process.cwd()` as a default argument in function signatures
 *     (library functions; not in shell/entry-point files)
 */
export interface AmbientRootViolation {
    path: string;
    line: number;
    pattern: string;
    message: string;
}
export interface AmbientRootAuditResult {
    violations: AmbientRootViolation[];
}
/**
 * Pure detection over the passed-in file array — no filesystem reads.
 */
export declare function detectAmbientRoot(files: Array<{
    path: string;
    contents: string;
}>): AmbientRootAuditResult;
//# sourceMappingURL=audit-no-ambient-root.d.ts.map