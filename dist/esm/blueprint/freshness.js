/**
 * HEAD-pinned projection freshness (F11 / E11 / R9).
 *
 * The blueprint markdown directory is git-tracked. A `git checkout other-branch`
 * flips on-disk files without touching the SQLite projection, so cached MCP
 * reads can silently return rows for the wrong commit. This module pins HEAD
 * at ingest time and refuses cached reads when HEAD has moved.
 *
 * Storage: a JSON sidecar at `<dbPath>.meta.json`. The sidecar is intentionally
 * decoupled from the SQLite schema so this task does not touch migrations or
 * collide with Task 1.1's path policy. The sidecar is rebuilt by the ingester
 * and may be safely deleted — `checkFreshness` will return
 * `next_action: 'reingest_project'`.
 *
 * Non-goals here:
 *   - No long-lived cache. Each call re-reads the sidecar and re-runs
 *     `git rev-parse HEAD`.
 *   - No watcher / no background invalidation.
 *   - No platform-canonical sync.
 *
 * Consumers: `assembleBlueprintContext` (this task) and Task 2.2's MCP
 * handlers (`wp_blueprint_list`, `_get`, `_context`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeJsonFile } from '#shared-utils/write-json-file.js';
import { makeNextAction } from './next-action.js';
// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
function sidecarPath(dbPath) {
    return `${dbPath}.meta.json`;
}
/** Run `git rev-parse HEAD` in cwd; return null when not a git repo / no commits. */
export function readCurrentHead(cwd) {
    try {
        const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5_000,
        }).trim();
        return sha.length > 0 ? sha : null;
    }
    catch {
        return null;
    }
}
function isProjectionMetadata(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const obj = value;
    const headOk = obj.head_at_ingest === null || typeof obj.head_at_ingest === 'string';
    const tsOk = typeof obj.ingested_at === 'number' && Number.isFinite(obj.ingested_at);
    const worktreeOk = obj.worktree_path === undefined || typeof obj.worktree_path === 'string';
    return headOk && tsOk && worktreeOk;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Read the sidecar metadata for a projection DB. Returns null on miss/parse-failure. */
export function readProjectionMetadata(dbPath) {
    const file = sidecarPath(dbPath);
    if (!existsSync(file))
        return null;
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    return isProjectionMetadata(parsed) ? parsed : null;
}
/**
 * Write the sidecar metadata. Caller (the ingester) supplies the cwd that was
 * just ingested so we capture the right HEAD.
 */
export function recordProjectionMetadata(input) {
    const metadata = {
        head_at_ingest: readCurrentHead(input.cwd),
        ingested_at: input.ingestedAt,
        worktree_path: input.cwd,
    };
    writeJsonFile(sidecarPath(input.dbPath), metadata, { atomic: true });
    return metadata;
}
/**
 * Decide whether the projection DB is fresh for the given worktree.
 *
 * Order of checks:
 *   1. DB file missing → `rebuild_db`.
 *   2. Sidecar missing → `reingest_project`.
 *   3. HEAD recorded ≠ HEAD now → `reingest_project`.
 *   4. Otherwise fresh.
 *
 * `null === null` is treated as fresh: a non-git worktree had no HEAD at
 * ingest and still has none.
 */
export function checkFreshness(project) {
    if (!existsSync(project.db_path)) {
        return {
            ok: false,
            next_action: makeNextAction('rebuild_db', `Projection DB missing at ${project.db_path}; run ingest to rebuild.`),
        };
    }
    const metadata = readProjectionMetadata(project.db_path);
    if (metadata === null) {
        return {
            ok: false,
            next_action: makeNextAction('reingest_project', `Projection metadata missing for ${project.db_path}; re-ingest the project.`),
        };
    }
    const current = readCurrentHead(project.worktree_path);
    if (metadata.head_at_ingest !== current) {
        return {
            ok: false,
            next_action: makeNextAction('reingest_project', `HEAD changed since ingest (was ${metadata.head_at_ingest ?? 'none'}, now ${current ?? 'none'}); re-ingest the project.`),
        };
    }
    return { ok: true, head: current, ingestedAt: metadata.ingested_at };
}
//# sourceMappingURL=freshness.js.map