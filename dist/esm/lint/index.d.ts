/**
 * Stable subpath export: `@webpresso/agent-kit/lint`.
 *
 * Exposes a framework-friendly `runLint` runner that uses the `vp lint`
 * facade. Mirrors the semantics of the `wp_lint` MCP tool but returns a
 * typed result object directly so external scaffolders can consume it without
 * reaching through the MCP transport.
 */
export interface LintIssue {
    readonly file: string;
    readonly line: number;
    readonly rule: string;
    readonly message: string;
}
export interface LintResult {
    readonly passed: boolean;
    readonly issues: readonly LintIssue[];
    readonly exitCode: number;
    readonly output?: string;
    readonly parseError?: string;
    readonly spawnError?: string;
    readonly timedOut?: boolean;
    readonly aborted?: boolean;
}
export interface RunLintOptions {
    /** Files or glob targets to lint. When omitted, lints `.` */
    readonly files?: readonly string[];
    /** Apply autofixes via `vp lint --fix`. */
    readonly fix?: boolean;
    /** Override the resolved project root. */
    readonly cwd?: string;
    /** Hard cap on the spawned process. Defaults to 5 minutes. */
    readonly timeoutMs?: number;
    /** Optional cancellation signal propagated to the child process. */
    readonly signal?: AbortSignal;
}
interface ParseOutcome {
    readonly issues: LintIssue[];
    readonly parseError?: string;
}
/**
 * Parse oxlint's `--format=json` output (ESLint-compatible array shape) into
 * a flat issue list. Annotates `parseError` on JSON or shape failure so the
 * caller can distinguish "lint passed cleanly" from "we couldn't read output".
 */
export declare function parseOxlintIssues(stdout: string): ParseOutcome;
/**
 * Run lint via `vp lint` and return a structured result. Spawn failures surface
 * explicitly via `spawnError`.
 */
export declare function runLint(options?: RunLintOptions): Promise<LintResult>;
export {};
//# sourceMappingURL=index.d.ts.map