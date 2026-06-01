/**
 * Single shared `runCommand` for tool spawns.
 *
 * Replaces near-duplicate implementations that lived in `lint.ts` and
 * `typecheck.ts`. Accepts:
 *
 *   - `timeoutMs` — internal deadline (per-tool default; lint=5min, typecheck=10min).
 *   - `signal`    — propagated from the MCP request's AbortSignal so a
 *                   client-issued `notifications/cancelled` aborts the spawn.
 *   - `cwd`       — explicit working directory; project-root resolution lives
 *                   in `./project-root.ts` to keep this module pure.
 *
 * Both internal-timeout and external-cancel kill paths surface as a
 * non-zero `exitCode` (signal-derived) and a `timedOut`/`aborted` flag in
 * the result, so callers never coerce a kill into success.
 */
export interface RunResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly signal: NodeJS.Signals | null;
    readonly timedOut: boolean;
    readonly aborted: boolean;
}
export interface RunFailure {
    readonly error: NodeJS.ErrnoException;
}
export type RunOutcome = RunResult | RunFailure;
export interface RunOptions {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
    readonly cwd?: string;
}
export declare function isRunFailure(outcome: RunOutcome): outcome is RunFailure;
export declare function isMissingBinary(failure: RunFailure): boolean;
export declare function runCommand(cmd: string, args: readonly string[], options: RunOptions): Promise<RunOutcome>;
//# sourceMappingURL=run-command.d.ts.map