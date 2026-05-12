/**
 * Stable subpath export: `@webpresso/agent-kit/typecheck`.
 *
 * Exposes a framework-friendly `runTypecheck` runner that wraps
 * `tsc --noEmit` either at cwd (no `packages` given) or once per resolved
 * package path (each becomes `tsc --noEmit -p <pkg>/tsconfig.json`). Mirrors
 * the semantics of the `ak_typecheck` MCP tool but returns a typed result
 * directly so external scaffolders can consume it without the MCP transport.
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
     * Package paths (relative to cwd). When omitted, runs a single
     * `tsc --noEmit` at cwd. When provided, runs once per package against
     * `<pkg>/tsconfig.json`.
     */
    readonly packages?: readonly string[];
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
 * provided, runs `tsc --noEmit -p <pkg>/tsconfig.json` once per entry
 * sequentially and aggregates output; otherwise a single root-level
 * `tsc --noEmit`. Throws on spawn failures (e.g. tsc missing) — those
 * indicate a misconfigured environment, not a typecheck verdict.
 */
export declare function runTypecheck(options?: RunTypecheckOptions): Promise<TypecheckResult>;
//# sourceMappingURL=index.d.ts.map