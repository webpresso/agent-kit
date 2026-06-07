/**
 * Blueprint mutation verbs — advanceTask, promoteBlueprint, finalizeBlueprint
 *
 * All mutations:
 *   1. Edit the canonical blueprint markdown document on disk (flat `.md` or
 *      folder `_overview.md`) via atomic tmp+rename
 *   2. Re-ingest into the structured-store DB via ingestAll
 *
 * Platform-first sync (Tasks 2.6 + 2.7):
 *   When a SyncAdapter is available (credentials present, not disabled), mutations
 *   push a BlueprintPlatformEvent before updating local markdown/SQLite.
 *   Iron rule: WP_BLUEPRINT_PLATFORM_DISABLED=1 skips the adapter entirely — the
 *   markdown-canonical path runs byte-identically to the pre-migration behaviour.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseBlueprint } from '#core/parser';
import { openDb } from '#db/connection.js';
import { ingestAll } from '#db/ingester.js';
import { resolveBlueprintProjectionDbPath, withMarkdownWriteLock, withProjectionDbWriteLock, } from '#db/paths.js';
import { getBlueprintDocumentPaths } from '#utils/document-paths.js';
import { resolveBlueprintRoot } from '#utils/blueprint-root.js';
import { assertAllTasksHaveCanonicalPassingEvidence } from '#verification.js';
/**
 * Module-level factory.  `null` = use the production default (loadSyncCredentials
 * from auth.ts + BlueprintSyncClient + ReplicaManager — lazy-imported so that
 * mutations.ts never statically depends on the HTTP client).
 */
let _syncAdapterFactory = null;
/**
 * Override the adapter factory — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export function _setSyncAdapterForCli(factory) {
    _syncAdapterFactory = factory;
}
/**
 * Resolve the sync adapter for the current CLI mutation.
 *
 * Iron rule: returns `null` when `WP_BLUEPRINT_PLATFORM_DISABLED=1` regardless
 * of any injected factory — the caller must skip all platform operations.
 *
 * @param cwd - repo working directory, used to locate the replica DB file.
 */
export async function resolveSyncAdapterForCli(cwd) {
    if (process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] === '1')
        return null;
    if (_syncAdapterFactory !== null) {
        return _syncAdapterFactory();
    }
    // Production default: lazy-import to avoid coupling the module to the HTTP client.
    const [{ BlueprintSyncClient }, { loadSyncCredentials }, { ReplicaManager }, { openDb: openDbForReplica },] = await Promise.all([
        import('#sync/client.js'),
        import('#sync/auth.js'),
        import('#sync/replica.js'),
        import('#db/connection.js'),
    ]);
    const creds = loadSyncCredentials();
    if (creds === null)
        return null;
    const client = new BlueprintSyncClient(creds);
    // ReplicaManager needs a db handle; store the replica DB alongside the blueprint DB.
    const replicaDbPath = path.join(cwd, '.agent', '.replica.db');
    const conn = openDbForReplica(replicaDbPath);
    const manager = new ReplicaManager({ client, db: conn.db });
    return {
        pushEvent: (event) => client.pushEvent(event),
        ensureFresh: (opts) => manager.ensureFresh(opts),
    };
}
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALL_STATES = ['draft', 'planned', 'in-progress', 'parked', 'archived', 'completed'];
const TASK_STATUSES = ['todo', 'in-progress', 'blocked', 'done', 'dropped'];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dbPath(cwd) {
    return resolveBlueprintProjectionDbPath(cwd);
}
function findBlueprintDocument(blueprintRoot, slug) {
    for (const state of ALL_STATES) {
        const paths = getBlueprintDocumentPaths(blueprintRoot, state, slug);
        if (existsSync(paths.flat)) {
            return {
                dir: path.dirname(paths.flat),
                documentPath: paths.flat,
                shape: 'flat',
                state,
            };
        }
        if (existsSync(paths.folder)) {
            return {
                dir: paths.directory,
                documentPath: paths.folder,
                shape: 'folder',
                state,
            };
        }
    }
    return null;
}
function atomicWriteFile(targetPath, content) {
    const tmpPath = path.join(tmpdir(), `wp-bp-mutation-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, targetPath);
}
async function reIngestDb(cwd) {
    const target = dbPath(cwd);
    if (!existsSync(target))
        return;
    // F9/R7: projection DB writes serialize via the worktree-scoped lock. Throws
    // LockTimeoutError on contention rather than silently proceeding.
    await withProjectionDbWriteLock(cwd, async () => {
        const conn = openDb(target);
        try {
            await ingestAll({ db: conn.db, cwd });
        }
        finally {
            conn.close();
        }
    });
}
/**
/**
 * Update `status:` in YAML frontmatter. Preserves everything else verbatim.
 */
function updateFrontmatterStatus(content, newStatus) {
    return content.replace(/^(status:\s*)(['"]?)[^'"\r\n]+?(['"]?)(\s*)$/m, `$1${newStatus}$4`);
}
/**
 * Add or update `completed_at:` in YAML frontmatter.
 * Inserts after the `status:` line if not already present.
 */
function upsertCompletedAt(content, isoDate) {
    // If already present, update it
    if (/^completed_at:/m.test(content)) {
        return content.replace(/^(completed_at:\s*).*$/m, `$1'${isoDate}'`);
    }
    // Insert after status line
    return content.replace(/^(status:[^\r\n]*)(\r?\n)/m, `$1$2completed_at: '${isoDate}'$2`);
}
/**
 * Find the task section in markdown and extract the current **Status:** value.
 * Returns { lineIndex, currentStatus } or null if not found.
 */
function findTaskStatusLine(lines, taskId) {
    const escapedId = taskId.replace(/\./g, '\\.');
    const taskPattern = new RegExp(`^####\\s+Task\\s+${escapedId}[:\\s]`);
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (taskPattern.test(line)) {
            inBlock = true;
            continue;
        }
        if (inBlock) {
            // A new #### heading closes the block
            if (line.startsWith('#### '))
                break;
            if (line.startsWith('**Status:**')) {
                const match = /^\*\*Status:\*\*\s+(.+)$/.exec(line);
                const currentStatus = match?.[1]?.trim() ?? '';
                return { lineIndex: i, currentStatus };
            }
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// advanceTask
// ---------------------------------------------------------------------------
/**
 * Advance a task's status in its blueprint markdown document, then re-ingest.
 *
 * Atomic: writes to a temp file then renames onto the original.
 * Idempotent: if the task is already at `toStatus`, reports "already <toStatus>" and exits cleanly.
 */
export async function advanceTask(cwd, blueprintSlug, taskId, toStatus) {
    // F9/R7: cross-worktree markdown writes serialize via the repo-scoped lock.
    return withMarkdownWriteLock(cwd, () => advanceTaskLocked(cwd, blueprintSlug, taskId, toStatus));
}
async function advanceTaskLocked(cwd, blueprintSlug, taskId, toStatus) {
    const blueprintRoot = resolveBlueprintRoot(cwd);
    const found = findBlueprintDocument(blueprintRoot, blueprintSlug);
    if (!found) {
        throw new Error(`Blueprint "${blueprintSlug}" not found in any state directory under ${blueprintRoot}`);
    }
    const content = readFileSync(found.documentPath, 'utf8');
    const lines = content.split('\n');
    const result = findTaskStatusLine(lines, taskId);
    if (!result) {
        throw new Error(`Task "${taskId}" not found in blueprint "${blueprintSlug}"`);
    }
    const { lineIndex, currentStatus } = result;
    if (toStatus === 'done') {
        throw new Error('Use wp_blueprint_task_verify to mark tasks done with evidence');
    }
    if (currentStatus === toStatus) {
        return {
            blueprintSlug,
            taskId,
            oldStatus: currentStatus,
            newStatus: toStatus,
            message: `Task ${taskId} of ${blueprintSlug}: already ${toStatus}`,
        };
    }
    // Platform-first path: push event + pull fresh replica before local update.
    // Iron rule: resolveSyncAdapterForCli() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
    const adapter = await resolveSyncAdapterForCli(cwd);
    if (adapter !== null) {
        await adapter.pushEvent({
            eventId: randomUUID(),
            repoId: process.env['WP_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
            occurredAt: new Date().toISOString(),
            type: 'task.status_changed',
            payload: {
                type: 'task.status_changed',
                blueprintSlug,
                taskId,
                fromStatus: currentStatus,
                toStatus,
            },
        });
        await adapter.ensureFresh({ slug: blueprintSlug });
    }
    // Always update local markdown + SQLite.
    // Platform-first: these become derived artifacts; disabled: these are canonical.
    const updatedLines = [...lines];
    updatedLines[lineIndex] = `**Status:** ${toStatus}`;
    const newContent = updatedLines.join('\n');
    atomicWriteFile(found.documentPath, newContent);
    await reIngestDb(cwd);
    return {
        blueprintSlug,
        taskId,
        oldStatus: currentStatus,
        newStatus: toStatus,
        message: `Task ${taskId} of ${blueprintSlug}: ${currentStatus} → ${toStatus}`,
    };
}
// ---------------------------------------------------------------------------
// promoteBlueprint
// ---------------------------------------------------------------------------
/**
 * Promote a blueprint to a new lifecycle state.
 *
 * - Updates `status:` in frontmatter
 * - If toState === 'completed': also sets `completed_at:` and verifies all tasks are `done`/`dropped`
 * - Moves directory to `blueprints/<toState>/<slug>/` atomically via renameSync
 * - Re-ingests into DB
 */
export async function promoteBlueprint(cwd, slug, toState) {
    // F9/R7: cross-worktree markdown writes serialize via the repo-scoped lock.
    return withMarkdownWriteLock(cwd, () => promoteBlueprintLocked(cwd, slug, toState));
}
async function promoteBlueprintLocked(cwd, slug, toState) {
    const blueprintRoot = resolveBlueprintRoot(cwd);
    const found = findBlueprintDocument(blueprintRoot, slug);
    if (!found) {
        throw new Error(`Blueprint "${slug}" not found in any state directory under ${blueprintRoot}`);
    }
    const { dir: currentDir, documentPath: currentDocumentPath, shape, state: currentState, } = found;
    // Guard: refuse to complete if any tasks are not done/dropped
    if (toState === 'completed') {
        const markdown = readFileSync(currentDocumentPath, 'utf8');
        const blueprint = parseBlueprint(markdown, slug);
        const unfinished = blueprint.tasks.filter((task) => task.status !== 'done' && task.status !== 'dropped');
        if (unfinished.length > 0) {
            const list = unfinished.map((task) => `${task.id} (${task.status})`).join(', ');
            throw new Error(`Cannot promote "${slug}" to completed: the following tasks are not done/dropped: ${list}`);
        }
        assertAllTasksHaveCanonicalPassingEvidence(markdown, blueprint.tasks.filter((task) => task.status === 'done').map((task) => task.id));
        const target = dbPath(cwd);
        if (existsSync(target)) {
            const conn = openDb(target);
            let openTasks;
            try {
                openTasks = conn.db
                    .prepare(`SELECT task_id, status FROM tasks WHERE blueprint_slug = ? AND status NOT IN ('done', 'dropped')`)
                    .all(slug);
            }
            finally {
                conn.close();
            }
            if (openTasks.length > 0) {
                const list = openTasks.map((t) => `${t.task_id} (${t.status})`).join(', ');
                throw new Error(`Cannot promote "${slug}" to completed: the following tasks are not done: ${list}`);
            }
        }
    }
    // Platform-first path: push event + pull fresh replica before local move.
    // Iron rule: resolveSyncAdapterForCli() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
    const adapter = await resolveSyncAdapterForCli(cwd);
    if (adapter !== null) {
        await adapter.pushEvent({
            eventId: randomUUID(),
            repoId: process.env['WP_BLUEPRINT_PLATFORM_REPO_ID'] ?? 'local',
            occurredAt: new Date().toISOString(),
            type: 'blueprint.status_changed',
            payload: {
                type: 'blueprint.status_changed',
                slug,
                fromStatus: currentState,
                toStatus: toState,
            },
        });
        await adapter.ensureFresh({ slug });
    }
    // Always update local markdown + SQLite.
    // Platform-first: these become derived artifacts; disabled: these are canonical.
    // Update frontmatter in the current location first, then move
    let content = readFileSync(currentDocumentPath, 'utf8');
    content = updateFrontmatterStatus(content, toState);
    if (toState === 'completed') {
        const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString();
        content = upsertCompletedAt(content, today);
    }
    const targetPaths = getBlueprintDocumentPaths(blueprintRoot, toState, slug);
    const destDir = targetPaths.directory;
    const destDocumentPath = shape === 'flat' ? targetPaths.flat : targetPaths.folder;
    if (currentDocumentPath === destDocumentPath) {
        // Same directory — only update frontmatter
        atomicWriteFile(currentDocumentPath, content);
        await reIngestDb(cwd);
        return {
            slug,
            oldState: currentState,
            newState: toState,
            newPath: currentDocumentPath,
            message: `Promoted ${slug}: ${currentState} → ${toState} (path unchanged: ${currentDocumentPath})`,
        };
    }
    // Write updated content to the current location first, then move the owning
    // file/directory according to the blueprint shape.
    atomicWriteFile(currentDocumentPath, content);
    mkdirSync(path.dirname(destDir), { recursive: true });
    renameSync(shape === 'flat' ? currentDocumentPath : currentDir, shape === 'flat' ? destDocumentPath : destDir);
    await reIngestDb(cwd);
    return {
        slug,
        oldState: currentState,
        newState: toState,
        newPath: destDocumentPath,
        message: `Promoted ${slug}: ${currentState} → ${toState} (new path: ${destDocumentPath})`,
    };
}
// ---------------------------------------------------------------------------
// finalizeBlueprint (convenience alias)
// ---------------------------------------------------------------------------
/**
 * Finalize a blueprint — alias for `promoteBlueprint(cwd, slug, 'completed')`.
 * Validates all tasks are done/dropped before moving.
 */
export async function finalizeBlueprint(cwd, slug) {
    return promoteBlueprint(cwd, slug, 'completed');
}
//# sourceMappingURL=mutations.js.map