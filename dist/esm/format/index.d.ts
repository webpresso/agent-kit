/**
 * Stable subpath export: `webpresso/format`.
 *
 * Wraps the bundled `vp fmt` surface behind `wp format`. Mirrors the
 * `runLint` API shape so consumers can compose lint + format in the same
 * pipeline. Unlike `runLint` there is NO fallback — the formatter facade must
 * be available; if missing we surface a clear error naming the missing binary.
 */
export interface FormatResult {
    readonly passed: boolean;
    readonly exitCode: number;
    readonly output: string;
    readonly fixedFiles?: readonly string[];
    readonly spawnError?: string;
    readonly timedOut?: boolean;
    readonly aborted?: boolean;
}
export interface RunFormatOptions {
    /** Files or glob targets. When omitted, `vp fmt`'s default discovery runs. */
    readonly files?: readonly string[];
    /** When true, only check (exit 1 on unformatted). When false/undefined, write fixes. */
    readonly check?: boolean;
    /** Override the resolved project root. */
    readonly cwd?: string;
    /** Hard cap on the spawned process. Defaults to 5 minutes. */
    readonly timeoutMs?: number;
    /** Optional cancellation signal propagated to the child process. */
    readonly signal?: AbortSignal;
}
/**
 * Run formatter and return a structured result. Throws a clear error when the
 * formatter backend is not on PATH (no silent fallback).
 */
export declare function runFormat(options?: RunFormatOptions): Promise<FormatResult>;
//# sourceMappingURL=index.d.ts.map