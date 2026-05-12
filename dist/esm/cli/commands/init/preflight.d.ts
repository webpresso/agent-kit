export interface PreflightResult {
    ok: boolean;
    score: number;
    warnings: readonly string[];
}
export declare const DOCS_URL = "https://github.com/webpresso/agent-kit/blob/main/docs/is-agent-kit-for-me.md";
/**
 * Run the 5-point compatibility preflight.
 *
 * @param repoRoot - Absolute path to the consumer repo root.
 * @param strict   - When true, `ok` is false if any check fails.
 *                   When false, `ok` is always true (warn-only mode).
 */
export declare function runPreflight(repoRoot: string, strict: boolean): Promise<PreflightResult>;
//# sourceMappingURL=preflight.d.ts.map