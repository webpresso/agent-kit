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

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseBlueprint } from "#core/parser";
import { openDb } from "#db/connection.js";
import { resolveBlueprintProjectionDbPath, withMarkdownWriteLock } from "#db/paths.js";
import { type BlueprintShape, getBlueprintDocumentPaths } from "#utils/document-paths.js";
import { resolveBlueprintRoot } from "#utils/blueprint-root.js";
import { reIngestProjection } from "#projection-ready.js";
import { assertAllTasksHaveCanonicalPassingEvidence } from "#verification.js";
import { applyPromotionTrustGate } from "#trust/promotion.js";
import matter from "gray-matter";
import { countDistinctApprovals } from "#lifecycle/audit";

// ---------------------------------------------------------------------------
// Platform-first sync adapter (injectable for tests, Tasks 2.6 + 2.7)
// ---------------------------------------------------------------------------

/**
 * Minimal platform sync surface needed by CLI mutation handlers.
 *
 * The production factory creates a BlueprintSyncClient + ReplicaManager pair.
 * Tests inject a mock via `_setSyncAdapterForCli`.
 *
 * Intentionally mirrors the SyncAdapter in blueprint-server.ts to keep the
 * two surfaces in sync without introducing a shared module dependency.
 */
export interface SyncAdapter {
  pushEvent(
    event:
      | {
          readonly eventId: string;
          readonly repoId: string;
          readonly occurredAt: string;
          readonly type: "task.status_changed";
          readonly payload: {
            readonly type: "task.status_changed";
            readonly blueprintSlug: string;
            readonly taskId: string;
            readonly fromStatus: string;
            readonly toStatus: string;
          };
        }
      | {
          readonly eventId: string;
          readonly repoId: string;
          readonly occurredAt: string;
          readonly type: "blueprint.status_changed";
          readonly payload: {
            readonly type: "blueprint.status_changed";
            readonly slug: string;
            readonly fromStatus: string;
            readonly toStatus: string;
          };
        },
  ): Promise<void>;
  ensureFresh(opts?: { readonly slug?: string }): Promise<void>;
}

type SyncAdapterFactory = () => SyncAdapter | null;
type SyncEvent = Parameters<SyncAdapter["pushEvent"]>[0];

/**
 * Module-level factory.  `null` = use the production default (loadSyncCredentials
 * from auth.ts + BlueprintSyncClient + ReplicaManager — lazy-imported so that
 * mutations.ts never statically depends on the HTTP client).
 */
let _syncAdapterFactory: SyncAdapterFactory | null = null;

/**
 * Override the adapter factory — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export function _setSyncAdapterForCli(factory: SyncAdapterFactory | null): void {
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
export async function resolveSyncAdapterForCli(cwd: string): Promise<SyncAdapter | null> {
  if (process.env["WP_BLUEPRINT_PLATFORM_DISABLED"] === "1") return null;

  if (_syncAdapterFactory !== null) {
    return _syncAdapterFactory();
  }

  // Production default: lazy-import to avoid coupling the module to the HTTP client.
  const [
    { BlueprintSyncClient },
    { loadSyncCredentials },
    { ReplicaManager },
    { openDb: openDbForReplica },
  ] = await Promise.all([
    import("#sync/client.js"),
    import("#sync/auth.js"),
    import("#sync/replica.js"),
    import("#db/connection.js"),
  ]);

  const creds = loadSyncCredentials();
  if (creds === null) return null;

  const client = new BlueprintSyncClient(creds);

  // ReplicaManager needs a db handle; store the replica DB alongside the blueprint DB.
  const replicaDbPath = path.join(cwd, ".agent", ".replica.db");
  const conn = openDbForReplica(replicaDbPath);
  const manager = new ReplicaManager({ client, db: conn.db });

  return {
    pushEvent: (event) => client.pushEvent(event),
    ensureFresh: (opts) => manager.ensureFresh(opts),
  };
}

const DEFAULT_PLATFORM_MUTATION_TIMEOUT_MS = 5_000;

function readPlatformMutationTimeoutMs(): number {
  const raw = process.env["WP_BLUEPRINT_PLATFORM_MUTATION_TIMEOUT_MS"];
  if (raw === undefined) return DEFAULT_PLATFORM_MUTATION_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PLATFORM_MUTATION_TIMEOUT_MS;
}

async function awaitPlatformMutationStep<T>(
  promise: Promise<T>,
  label: string,
  step: string,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${step} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} platform sync failed: ${message}`);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function runCliPlatformMutationSync(
  adapter: SyncAdapter | null,
  options: {
    readonly label: string;
    readonly event?: SyncEvent;
    readonly ensureFreshSlug?: string;
  },
): Promise<void> {
  if (adapter === null) return;

  const timeoutMs = readPlatformMutationTimeoutMs();
  if (options.event !== undefined) {
    await awaitPlatformMutationStep(
      adapter.pushEvent(options.event),
      options.label,
      "pushEvent",
      timeoutMs,
    );
  }
  if (options.ensureFreshSlug !== undefined) {
    await awaitPlatformMutationStep(
      adapter.ensureFresh({ slug: options.ensureFreshSlug }),
      options.label,
      "ensureFresh",
      timeoutMs,
    );
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_STATES = ["draft", "planned", "in-progress", "parked", "archived", "completed"] as const;

type BlueprintState = (typeof ALL_STATES)[number];

const TASK_STATUSES = ["todo", "in-progress", "blocked", "done", "dropped"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdvanceTaskResult {
  readonly blueprintSlug: string;
  readonly taskId: string;
  readonly oldStatus: string;
  readonly newStatus: TaskStatus;
  readonly message: string;
}

export interface PromoteBlueprintResult {
  readonly slug: string;
  readonly oldState: string;
  readonly newState: BlueprintState;
  readonly newPath: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dbPath(cwd: string): string {
  return resolveBlueprintProjectionDbPath(cwd);
}

function findBlueprintDocument(
  blueprintRoot: string,
  slug: string,
): { dir: string; documentPath: string; shape: BlueprintShape; state: string } | null {
  for (const state of ALL_STATES) {
    const paths = getBlueprintDocumentPaths(blueprintRoot, state, slug);
    if (existsSync(paths.flat)) {
      return {
        dir: path.dirname(paths.flat),
        documentPath: paths.flat,
        shape: "flat",
        state,
      };
    }
    if (existsSync(paths.folder)) {
      return {
        dir: paths.directory,
        documentPath: paths.folder,
        shape: "folder",
        state,
      };
    }
  }
  return null;
}

function atomicWriteFile(targetPath: string, content: string): void {
  const tmpPath = path.join(tmpdir(), `wp-bp-mutation-${Date.now()}-${randomUUID()}.tmp`);
  writeFileSync(tmpPath, content, "utf8");
  renameSync(tmpPath, targetPath);
}

async function reIngestDb(cwd: string): Promise<void> {
  // Skip when no projection exists yet — a mutation must not *create* one.
  // Otherwise delegate to `reIngestProjection`, the single owner of the
  // persistent reingest sequence (prune → write-lock → ingest → record freshness
  // metadata), so the freshness sidecar HEAD stamp stays current.
  if (!existsSync(dbPath(cwd))) return;
  await reIngestProjection(cwd);
}

/**
/**
 * Update `status:` in YAML frontmatter. Preserves everything else verbatim.
 */
function updateFrontmatterStatus(content: string, newStatus: string): string {
  return content.replace(/^(status:\s*)(['"]?)[^'"\r\n]+?(['"]?)(\s*)$/m, `$1${newStatus}$4`);
}

/**
 * Add or update `completed_at:` in YAML frontmatter.
 * Inserts after the `status:` line if not already present.
 */
function upsertCompletedAt(content: string, isoDate: string): string {
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
function findTaskStatusLine(
  lines: readonly string[],
  taskId: string,
): { lineIndex: number; currentStatus: string; prefix: string; suffix: string } | null {
  const escapedId = taskId.replace(/\./g, "\\.");
  const taskPattern = new RegExp(`^####\\s+(?:\\[[^\\]]+\\]\\s+)?Task\\s+${escapedId}[:\\s]`);
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (taskPattern.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      // A new #### heading closes the block
      if (line.startsWith("#### ")) break;
      if (line.startsWith("**Status:**")) {
        const match = /^(\*\*Status:\*\*\s+)([^|\s]+)(.*)$/.exec(line);
        const currentStatus = match?.[2]?.trim().replace(/\bin_progress\b/gi, "in-progress") ?? "";
        return {
          lineIndex: i,
          currentStatus,
          prefix: match?.[1] ?? "**Status:** ",
          suffix: match?.[3] ?? "",
        };
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
export async function advanceTask(
  cwd: string,
  blueprintSlug: string,
  taskId: string,
  toStatus: TaskStatus,
): Promise<AdvanceTaskResult> {
  // F9/R7: cross-worktree markdown writes serialize via the repo-scoped lock.
  return withMarkdownWriteLock(cwd, () => advanceTaskLocked(cwd, blueprintSlug, taskId, toStatus));
}

async function advanceTaskLocked(
  cwd: string,
  blueprintSlug: string,
  taskId: string,
  toStatus: TaskStatus,
): Promise<AdvanceTaskResult> {
  const blueprintRoot = resolveBlueprintRoot(cwd);
  const found = findBlueprintDocument(blueprintRoot, blueprintSlug);
  if (!found) {
    throw new Error(
      `Blueprint "${blueprintSlug}" not found in any state directory under ${blueprintRoot}`,
    );
  }

  const content = readFileSync(found.documentPath, "utf8");
  const lines = content.split("\n");

  const result = findTaskStatusLine(lines, taskId);
  if (!result) {
    throw new Error(`Task "${taskId}" not found in blueprint "${blueprintSlug}"`);
  }

  const { lineIndex, currentStatus, prefix, suffix } = result;

  if (toStatus === "done") {
    throw new Error("Use wp_blueprint_task_verify to mark tasks done with evidence");
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
  await runCliPlatformMutationSync(adapter, {
    label: "wp_blueprint_task_advance",
    event: {
      eventId: randomUUID(),
      repoId: process.env["WP_BLUEPRINT_PLATFORM_REPO_ID"] ?? "local",
      occurredAt: new Date().toISOString(),
      type: "task.status_changed",
      payload: {
        type: "task.status_changed",
        blueprintSlug,
        taskId,
        fromStatus: currentStatus,
        toStatus,
      },
    },
    ensureFreshSlug: blueprintSlug,
  });

  // Always update local markdown + SQLite.
  // Platform-first: these become derived artifacts; disabled: these are canonical.
  const updatedLines = [...lines];
  updatedLines[lineIndex] = `${prefix}${toStatus}${suffix}`;
  const newContent = updatedLines.join("\n");

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
export async function promoteBlueprint(
  cwd: string,
  slug: string,
  toState: "planned" | "in-progress" | "completed" | "parked",
): Promise<PromoteBlueprintResult> {
  // F9/R7: cross-worktree markdown writes serialize via the repo-scoped lock.
  return withMarkdownWriteLock(cwd, () => promoteBlueprintLocked(cwd, slug, toState));
}

async function promoteBlueprintLocked(
  cwd: string,
  slug: string,
  toState: "planned" | "in-progress" | "completed" | "parked",
): Promise<PromoteBlueprintResult> {
  const blueprintRoot = resolveBlueprintRoot(cwd);
  const found = findBlueprintDocument(blueprintRoot, slug);
  if (!found) {
    throw new Error(`Blueprint "${slug}" not found in any state directory under ${blueprintRoot}`);
  }

  const { dir: currentDir, documentPath: currentDocumentPath, shape, state: currentState } = found;

  // Guard: refuse to complete if any tasks are not done/dropped
  if (toState === "completed") {
    const markdown = readFileSync(currentDocumentPath, "utf8");
    const blueprint = parseBlueprint(markdown, slug);
    if (blueprint.tasks.length === 0) {
      throw new Error(
        `Cannot promote "${slug}" to completed: zero-task blueprints cannot complete through the public lifecycle surface`,
      );
    }
    const unfinished = blueprint.tasks.filter(
      (task) => task.status !== "done" && task.status !== "dropped",
    );
    if (unfinished.length > 0) {
      const list = unfinished.map((task) => `${task.id} (${task.status})`).join(", ");
      throw new Error(
        `Cannot promote "${slug}" to completed: the following tasks are not done/dropped: ${list}`,
      );
    }
    assertAllTasksHaveCanonicalPassingEvidence(
      markdown,
      blueprint.tasks.filter((task) => task.status === "done").map((task) => task.id),
    );

    const target = dbPath(cwd);
    if (existsSync(target)) {
      const conn = openDb(target);
      let openTasks: Array<{ task_id: string; status: string }>;
      try {
        openTasks = conn.db
          .prepare<[string], { task_id: string; status: string }>(
            `SELECT task_id, status FROM tasks WHERE blueprint_slug = ? AND status NOT IN ('done', 'dropped')`,
          )
          .all(slug) as Array<{ task_id: string; status: string }>;
      } finally {
        conn.close();
      }
      if (openTasks.length > 0) {
        const list = openTasks.map((t) => `${t.task_id} (${t.status})`).join(", ");
        throw new Error(
          `Cannot promote "${slug}" to completed: the following tasks are not done: ${list}`,
        );
      }
    }
  }

  // Platform freshness must be resolved before trust validation so the proof
  // applies to the current replica, not stale local markdown.
  // Iron rule: resolveSyncAdapterForCli() returns null when WP_BLUEPRINT_PLATFORM_DISABLED=1.
  const adapter = await resolveSyncAdapterForCli(cwd);
  await runCliPlatformMutationSync(adapter, {
    label: "wp_blueprint_promote",
    ensureFreshSlug: slug,
  });

  // Trust must be proven before any platform status_changed event is published.
  let content = readFileSync(currentDocumentPath, "utf8");
  let trustedSource = content;
  if (currentState === "draft" && toState === "planned") {
    // Governance Piece 1 — HARD gate at the promotion boundary: ≥2 distinct
    // reviewer approvals in frontmatter `approvals:`. (The audit sweep warns on
    // pre-rule blueprints; this blocks NEW promotions.)
    const distinctApprovals = countDistinctApprovals(
      (matter(content).data as Record<string, unknown>).approvals,
    );
    if (distinctApprovals < 2) {
      throw new Error(
        `Cannot promote "${slug}" to planned: ${distinctApprovals} distinct reviewer approval(s) in frontmatter \`approvals:\` (need ≥2). Record approvals from distinct reviewers (e.g. /plan-eng-review, /codex, /deepseek) — see catalog/agent/rules/pre-implementation.md.`,
      );
    }
    content = applyPromotionTrustGate({
      repoRoot: cwd,
      file: currentDocumentPath,
      markdown: content,
    });
    trustedSource = readFileSync(currentDocumentPath, "utf8");
  }

  // Platform-first path: push event + pull fresh replica before local move.
  await runCliPlatformMutationSync(adapter, {
    label: "wp_blueprint_promote",
    event: {
      eventId: randomUUID(),
      repoId: process.env["WP_BLUEPRINT_PLATFORM_REPO_ID"] ?? "local",
      occurredAt: new Date().toISOString(),
      type: "blueprint.status_changed",
      payload: {
        type: "blueprint.status_changed",
        slug,
        fromStatus: currentState,
        toStatus: toState,
      },
    },
    ensureFreshSlug: slug,
  });
  if (adapter !== null) {
    if (currentState === "draft" && toState === "planned") {
      const refreshedSource = readFileSync(currentDocumentPath, "utf8");
      if (refreshedSource !== trustedSource) {
        content = applyPromotionTrustGate({
          repoRoot: cwd,
          file: currentDocumentPath,
          markdown: refreshedSource,
        });
        trustedSource = refreshedSource;
      }
    }
  }

  // Always update local markdown + SQLite.
  // Platform-first: these become derived artifacts; disabled: these are canonical.
  // Update frontmatter in the current location first, then move
  content = updateFrontmatterStatus(content, toState);
  if (toState === "completed") {
    const today = new Date().toISOString().split("T")[0] ?? new Date().toISOString();
    content = upsertCompletedAt(content, today);
  }

  const targetPaths = getBlueprintDocumentPaths(blueprintRoot, toState, slug);
  const destDir = targetPaths.directory;
  const destDocumentPath = shape === "flat" ? targetPaths.flat : targetPaths.folder;

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
  renameSync(
    shape === "flat" ? currentDocumentPath : currentDir,
    shape === "flat" ? destDocumentPath : destDir,
  );

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
export async function finalizeBlueprint(
  cwd: string,
  slug: string,
): Promise<PromoteBlueprintResult> {
  return promoteBlueprint(cwd, slug, "completed");
}
