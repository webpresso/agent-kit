/**
 * Centralized blueprint projection-DB path policy.
 *
 * Single source of truth for where the SQLite projection of blueprint markdown
 * lives, plus the two lock files that gate writes to that projection and to
 * the underlying markdown directory.
 *
 * ## Lock-scope decision (F9 / R7, Task 1.1)
 *
 * We adopt the **two-lock** policy:
 *
 * 1. **Projection DB lock — `'worktree'` scope.**
 *    The SQLite file at `getSurfacePath('blueprints/blueprints.db', 'worktree', cwd)`
 *    is a per-worktree derived artifact. Concurrent writers in the **same**
 *    worktree (cold-start + mutation re-ingest, two ingest paths, etc.) must
 *    serialize against the projection. Cross-worktree writers target distinct
 *    DB files, so they do not need this lock.
 *
 * 2. **Markdown-mutation lock — `'repo'` scope.**
 *    The `blueprints/` markdown directory is git-tracked and shared across
 *    all worktrees of the same repository. Cross-worktree concurrent writers
 *    that mutate markdown (`advanceTask`, `promoteBlueprint`, `finalizeBlueprint`)
 *    must serialize against each other. This lock guards the directory, not
 *    the DB.
 *
 * ## Silent advisory escape removed
 *
 * The legacy `acquireLock` helper in `cold-start.ts` waited up to 5 s and then
 * "proceeded anyway" if it could not acquire. That escape is removed on write
 * paths — write callers must use the typed lock helpers in this module, which
 * raise `LockTimeoutError` on failure. Read-only paths may proceed without a
 * lock (they take a consistent SQLite snapshot regardless).
 *
 * ## Legacy fallback
 *
 * Non-git temp repos (most tests, ad-hoc directories) cannot resolve a repo
 * key. For those we keep the historical `<cwd>/.agent/.blueprints.db` layout
 * so existing fixtures and bootstrap flows continue to work.
 *
 * For git repos that still carry a stray `.agent/.blueprints.db` from a
 * previous webpresso version, see `legacy-migration.ts`.
 */
export declare const LEGACY_AGENT_DIR = ".agent";
export declare const LEGACY_DB_FILENAME = ".blueprints.db";
export declare const LEGACY_LOCK_FILENAME = ".blueprints.lock";
export declare class LockTimeoutError extends Error {
    readonly lockPath: string;
    readonly nextAction: 'reingest_project';
    constructor(lockPath: string, cause?: unknown);
}
/**
 * Resolve the worktree-scoped projection DB path.
 *
 * In a git repo: `<state-root>/<repoKey>/worktree/<wtKey>/blueprints/blueprints.db`.
 * Outside a git repo: legacy `<cwd>/.agent/.blueprints.db` (no isolation).
 */
export declare function resolveBlueprintProjectionDbPath(cwd: string): string;
/**
 * Resolve the worktree-scoped lock file for the projection DB.
 *
 * Lives next to the DB so a single `mkdir -p` covers both. Cross-worktree
 * writers do not contend on this lock; see `resolveBlueprintMarkdownLockPath`
 * for the cross-worktree case.
 */
export declare function resolveBlueprintProjectionDbLockPath(cwd: string): string;
/**
 * Resolve the repo-scoped lock file for markdown mutations.
 *
 * Two worktrees of one repo share the same markdown directory under git, so
 * mutations against `_overview.md` must serialize across worktrees.
 */
export declare function resolveBlueprintMarkdownLockPath(cwd: string): string;
export interface AcquireLockOptions {
    /** Lock-acquisition timeout. Default 5000ms. */
    readonly timeoutMs?: number;
    /** Stale-lock window (proper-lockfile recovers if holder died). Default 30000ms. */
    readonly staleMs?: number;
}
/**
 * Acquire the worktree-scoped projection-DB write lock.
 *
 * Throws `LockTimeoutError` on failure — there is no silent "proceeds anyway"
 * escape. Read-only callers should not use this helper.
 */
export declare function acquireProjectionDbWriteLock(cwd: string, opts?: AcquireLockOptions): Promise<() => Promise<void>>;
/**
 * Acquire the repo-scoped markdown-mutation write lock.
 *
 * Two worktrees of one repo share `blueprints/` under git, so cross-worktree
 * mutations must serialize here. Throws `LockTimeoutError` on failure.
 */
export declare function acquireMarkdownWriteLock(cwd: string, opts?: AcquireLockOptions): Promise<() => Promise<void>>;
/**
 * Run `fn` while holding the projection-DB write lock. Lock is released even
 * if `fn` throws. See `acquireProjectionDbWriteLock` for the no-silent-escape
 * guarantee.
 */
export declare function withProjectionDbWriteLock<T>(cwd: string, fn: () => Promise<T> | T, opts?: AcquireLockOptions): Promise<T>;
/**
 * Run `fn` while holding the markdown-mutation write lock. Lock is released
 * even if `fn` throws.
 */
export declare function withMarkdownWriteLock<T>(cwd: string, fn: () => Promise<T> | T, opts?: AcquireLockOptions): Promise<T>;
//# sourceMappingURL=paths.d.ts.map