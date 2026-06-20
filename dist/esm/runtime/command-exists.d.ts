/**
 * Cross-platform `command exists and is runnable` check.
 *
 * Replaces the `spawnSync('which', [cmd])` pattern that was copy-pasted across the
 * init scaffolders and `runners/select.ts`. That pattern is POSIX-only (`which` does
 * not exist on Windows, which uses `where`), so every check returned false on win32
 * even when the binary was installed. It also spawned a subprocess per call.
 *
 * This module scans `PATH` (+ `PATHEXT` on win32) directly — no subprocess — and is
 * pure given injected `platform`/`pathEnv`/`pathExtEnv`, so it is deterministically
 * unit-testable for both posix and win32 without touching the host PATH.
 *
 * Predicate is **runnable**, matching `which`: a candidate counts only if it is a
 * regular file that is executable (posix `X_OK`). A directory or non-executable file
 * named like the command is not a match. (`package-root.ts:resolveBinOnPath` keeps a
 * separate `exists` predicate for locating npm shims — a different question.)
 */
export interface CommandLookupOptions {
    readonly platform?: NodeJS.Platform;
    readonly pathEnv?: string;
    readonly pathExtEnv?: string;
}
/**
 * Enumerate every candidate filesystem path for `command` across all `PATH` entries,
 * cross-platform (win32 PATHEXT-aware). Pure — no filesystem or subprocess access.
 * Both the platform-specific join and the host-default join are emitted so a win32
 * simulation still resolves real fixtures on a posix test filesystem.
 */
export declare function pathCandidates(command: string, options?: CommandLookupOptions): string[];
/**
 * Cross-platform check for whether `command` resolves to a runnable executable on
 * `PATH`. Never spawns a subprocess. See the module doc for the predicate contract.
 */
export declare function commandExists(command: string, options?: CommandLookupOptions): boolean;
//# sourceMappingURL=command-exists.d.ts.map