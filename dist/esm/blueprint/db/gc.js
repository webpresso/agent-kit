import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { readProjectionMetadata } from "#freshness.js";
import { getStateRoot } from "#paths/state-root.js";
const DEFAULT_PROJECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LEGACY_WORKTREE_SEGMENT = `${path.sep}worktree${path.sep}`;
function safeListDirs(root) {
    if (!existsSync(root))
        return [];
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, entry.name));
}
function removeProjection(dbPath) {
    let pruned = 0;
    for (const target of [dbPath, `${dbPath}.meta.json`]) {
        if (!existsSync(target))
            continue;
        rmSync(target, { force: true });
        pruned += 1;
    }
    return pruned;
}
function shouldPruneRepoScopedProjection(dbPath, now, ttlMs) {
    const metadata = readProjectionMetadata(dbPath);
    if (!metadata)
        return false;
    if (metadata.worktree_path && !existsSync(metadata.worktree_path))
        return true;
    return now - metadata.ingested_at > ttlMs;
}
export function pruneProjectionArtifacts(options = {}) {
    const stateRoot = options.stateRoot ?? getStateRoot();
    const now = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? DEFAULT_PROJECTION_TTL_MS;
    const preserveDbPath = options.preserveDbPath;
    let pruned = 0;
    for (const repoRoot of safeListDirs(stateRoot)) {
        const repoScopedDb = path.join(repoRoot, "blueprints", "blueprints.db");
        if (repoScopedDb !== preserveDbPath &&
            shouldPruneRepoScopedProjection(repoScopedDb, now, ttlMs)) {
            pruned += removeProjection(repoScopedDb);
        }
        const legacyWorktreeRoot = path.join(repoRoot, "worktree");
        for (const worktreeDir of safeListDirs(legacyWorktreeRoot)) {
            const legacyDb = path.join(worktreeDir, "blueprints", "blueprints.db");
            if (legacyDb === preserveDbPath)
                continue;
            if (!legacyDb.includes(LEGACY_WORKTREE_SEGMENT))
                continue;
            pruned += removeProjection(legacyDb);
        }
    }
    return { pruned };
}
//# sourceMappingURL=gc.js.map