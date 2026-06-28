/**
 * Stable subpath export: `webpresso/typecheck`.
 *
 * Exposes a framework-friendly `runTypecheck` runner that mirrors the
 * semantics of the `wp_typecheck` MCP tool without the MCP transport.
 */
export interface TscError {
    readonly file: string;
    readonly line: number;
    readonly code: string;
    readonly message: string;
}
export interface TypecheckResult {
    readonly passed: boolean;
    readonly errorCount: number;
    readonly errors: readonly TscError[];
    readonly output: string;
    readonly timedOut?: boolean;
    readonly aborted?: boolean;
}
export interface RunTypecheckOptions {
    /**
     * Exact package.json names. When provided, runs one normal typecheck per
     * resolved owning scope.
     */
    readonly packages?: readonly string[];
    /**
     * Source files whose owning scope should be typechecked. This never runs
     * isolated-file TypeScript; it resolves the file(s) to owning scope(s) and
     * runs the normal scope-level typecheck once per resolved scope.
     */
    readonly files?: readonly string[];
    /** Override the resolved project root. */
    readonly cwd?: string;
    /** Hard cap on the spawned process(es). Defaults to 10 minutes. */
    readonly timeoutMs?: number;
    /** Optional cancellation signal propagated to the child process(es). */
    readonly signal?: AbortSignal;
}
/**
 * Parse `tsc --noEmit` stdout into structured `{file, line, code, message}`
 * entries. Lines that don't match the diagnostic format are ignored so
 * preamble/`tsc` chatter never ends up in the error list.
 */
export declare function parseTscOutput(raw: string): TscError[];
/**
 * Run typecheck and return structured diagnostics. When `packages` is
 * provided, resolves exact package scopes; when `files` is provided, resolves
 * each file to its owning scope; otherwise it preserves the existing root
 * typecheck behavior. Throws on spawn failures (e.g. tsc missing) — those
 * indicate a misconfigured environment, not a typecheck verdict.
 */
export declare function runTypecheck(options?: RunTypecheckOptions): Promise<TypecheckResult>;
//# sourceMappingURL=index.d.ts.map