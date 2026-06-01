/**
 * Legacy DB deprecation + migration (F12 / R10 / E12, Task 1.1).
 *
 * Pre-worktree-scoping, the projection DB lived at
 * `<cwd>/.agent/.blueprints.db`. Task 1.1 moves it under the worktree-scoped
 * state-root path. For git repos that still have the legacy file (and any
 * sibling `-wal` / `-shm` files from a crashed write), do the following on
 * first access:
 *
 *  1. Log a one-line deprecation pointing at the new path.
 *  2. If the destination does not exist, rename the legacy files to the new
 *     location. Sibling WAL/SHM are moved alongside the main DB.
 *  3. If the destination already exists, leave both untouched and surface a
 *     failure-style warning. Callers should not double-count.
 *
 * Memoized per-repo so repeated calls within a process touch disk once.
 */
export declare const LEGACY_DB_SIBLINGS: readonly ["-wal", "-shm"];
export type MigrationOutcome = 'migrated' | 'destination-exists' | 'no-legacy' | 'not-git';
export interface MigrationResult {
    readonly outcome: MigrationOutcome;
    readonly legacyPath: string;
    readonly destinationPath: string | null;
    readonly movedSiblings: readonly string[];
    readonly warning: string | null;
}
interface Logger {
    warn(msg: string): void;
}
/**
 * Detect and (if safe) migrate a legacy `.agent/.blueprints.db` for `cwd`.
 *
 * Idempotent and memoized per `cwd`. Outside a git repo the function is a
 * no-op (returns `outcome: 'not-git'`) because the legacy path *is* the
 * canonical path in that case.
 */
export declare function migrateLegacyAgentDb(cwd: string, logger?: Logger): MigrationResult;
/** Test-only helper. */
export declare function _clearMigrationMemoForTests(): void;
export {};
//# sourceMappingURL=legacy-migration.d.ts.map