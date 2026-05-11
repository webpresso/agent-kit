/**
 * Blueprint mutation verbs — advanceTask, promoteBlueprint, finalizeBlueprint
 *
 * All mutations:
 *   1. Edit the canonical _overview.md on disk (atomic tmp+rename)
 *   2. Re-ingest into the structured-store DB via ingestAll
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '#db/connection.js';
import { ingestAll } from '#db/ingester.js';
import { resolveBlueprintRoot } from '#utils/blueprint-root.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DB_FILENAME = '.blueprints.db';
const ALL_STATES = [
    'draft',
    'planned',
    'in-progress',
    'parked',
    'archived',
    'completed',
];
const TASK_STATUSES = ['todo', 'in-progress', 'blocked', 'done', 'dropped'];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dbPath(cwd) {
    return path.join(cwd, '.agent', DB_FILENAME);
}
function findBlueprintDir(blueprintRoot, slug) {
    for (const state of ALL_STATES) {
        const d = path.join(blueprintRoot, state, slug);
        if (existsSync(d))
            return { dir: d, state };
    }
    return null;
}
function atomicWriteFile(targetPath, content) {
    const tmpPath = path.join(tmpdir(), `ak-bp-mutation-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, targetPath);
}
async function reIngestDb(cwd) {
    const target = dbPath(cwd);
    if (!existsSync(target))
        return;
    const conn = openDb(target);
    try {
        await ingestAll({ db: conn.db, cwd });
    }
    finally {
        conn.close();
    }
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
 * Advance a task's status in its blueprint's _overview.md, then re-ingest.
 *
 * Atomic: writes to a temp file then renames onto the original.
 * Idempotent: if the task is already at `toStatus`, reports "already <toStatus>" and exits cleanly.
 */
export async function advanceTask(cwd, blueprintSlug, taskId, toStatus) {
    const blueprintRoot = resolveBlueprintRoot(cwd);
    const found = findBlueprintDir(blueprintRoot, blueprintSlug);
    if (!found) {
        throw new Error(`Blueprint "${blueprintSlug}" not found in any state directory under ${blueprintRoot}`);
    }
    const overviewPath = path.join(found.dir, '_overview.md');
    if (!existsSync(overviewPath)) {
        throw new Error(`Blueprint overview not found: ${overviewPath}`);
    }
    const content = readFileSync(overviewPath, 'utf8');
    const lines = content.split('\n');
    const result = findTaskStatusLine(lines, taskId);
    if (!result) {
        throw new Error(`Task "${taskId}" not found in blueprint "${blueprintSlug}"`);
    }
    const { lineIndex, currentStatus } = result;
    if (currentStatus === toStatus) {
        return {
            blueprintSlug,
            taskId,
            oldStatus: currentStatus,
            newStatus: toStatus,
            message: `Task ${taskId} of ${blueprintSlug}: already ${toStatus}`,
        };
    }
    const updatedLines = [...lines];
    updatedLines[lineIndex] = `**Status:** ${toStatus}`;
    const newContent = updatedLines.join('\n');
    atomicWriteFile(overviewPath, newContent);
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
    const blueprintRoot = resolveBlueprintRoot(cwd);
    const found = findBlueprintDir(blueprintRoot, slug);
    if (!found) {
        throw new Error(`Blueprint "${slug}" not found in any state directory under ${blueprintRoot}`);
    }
    const { dir: currentDir, state: currentState } = found;
    const overviewPath = path.join(currentDir, '_overview.md');
    if (!existsSync(overviewPath)) {
        throw new Error(`Blueprint overview not found: ${overviewPath}`);
    }
    // Guard: refuse to complete if any tasks are not done/dropped
    if (toState === 'completed') {
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
    // Update frontmatter in the current location first, then move
    let content = readFileSync(overviewPath, 'utf8');
    content = updateFrontmatterStatus(content, toState);
    if (toState === 'completed') {
        const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString();
        content = upsertCompletedAt(content, today);
    }
    const destDir = path.join(blueprintRoot, toState, slug);
    const destOverviewPath = path.join(destDir, '_overview.md');
    if (currentDir === destDir) {
        // Same directory — only update frontmatter
        atomicWriteFile(overviewPath, content);
        await reIngestDb(cwd);
        return {
            slug,
            oldState: currentState,
            newState: toState,
            newPath: overviewPath,
            message: `Promoted ${slug}: ${currentState} → ${toState} (path unchanged: ${overviewPath})`,
        };
    }
    // Write updated content to current location first, then move directory
    atomicWriteFile(overviewPath, content);
    mkdirSync(path.dirname(destDir), { recursive: true });
    renameSync(currentDir, destDir);
    await reIngestDb(cwd);
    return {
        slug,
        oldState: currentState,
        newState: toState,
        newPath: destOverviewPath,
        message: `Promoted ${slug}: ${currentState} → ${toState} (new path: ${destOverviewPath})`,
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