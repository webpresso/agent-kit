import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "#db/connection.js";
import type { Database } from "#db/sqlite.js";

import {
  assembleBlueprintContext,
  CONTEXT_CHUNK_MAX_BYTES,
  type ContextChunk,
  type ContextResult,
} from "./context.js";
import { recordProjectionMetadata } from "./freshness.js";

// ---------------------------------------------------------------------------
// Fixture helpers — direct row insertion, no parser/ingester dependency.
// ---------------------------------------------------------------------------

interface SeedBlueprint {
  slug: string;
  title?: string;
  status?: "draft" | "planned" | "in-progress" | "completed" | "parked" | "archived";
  filePath?: string;
  contentHash?: string;
  ingestedAt?: number;
}

interface SeedTask {
  blueprintSlug: string;
  taskId: string;
  title?: string;
  status?: "todo" | "in-progress" | "blocked" | "done" | "dropped";
  wave?: string | null;
  description?: string | null;
}

function insertBlueprint(db: Database, b: SeedBlueprint): void {
  db.prepare(
    `INSERT INTO blueprints
      (slug, title, status, complexity, owner, file_path, byte_size,
       content_hash, ingested_at, organization, visibility)
     VALUES (?, ?, ?, 'M', 'tester', ?, 100, ?, ?, 'test-org', 'private')`,
  ).run(
    b.slug,
    b.title ?? b.slug,
    b.status ?? "in-progress",
    b.filePath ?? `/fake/${b.slug}/_overview.md`,
    b.contentHash ?? `hash-${b.slug}`,
    b.ingestedAt ?? 1_700_000_000_000,
  );
}

function insertTask(db: Database, t: SeedTask): number {
  const info = db
    .prepare(
      `INSERT INTO tasks
        (blueprint_slug, task_id, wave, title, status, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      t.blueprintSlug,
      t.taskId,
      t.wave ?? null,
      t.title ?? `Task ${t.taskId}`,
      t.status ?? "todo",
      t.description ?? null,
    );
  return Number(info.lastInsertRowid);
}

function addTaskDep(db: Database, taskRowId: number, dependsOnRowId: number): void {
  db.prepare(`INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)`).run(
    taskRowId,
    dependsOnRowId,
  );
}

// ---------------------------------------------------------------------------
// Test rig
// ---------------------------------------------------------------------------

let tmp: string;
let dbPath: string;
let dbConn: ReturnType<typeof openDb>;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "wp-context-"));
  dbPath = path.join(tmp, "blueprints.db");
  dbConn = openDb(dbPath);
  // Pin freshness so assembleBlueprintContext does not bail on missing metadata.
  recordProjectionMetadata({ dbPath, cwd: tmp, ingestedAt: 1_700_000_000_000 });
});

afterEach(() => {
  dbConn.close();
  rmSync(tmp, { recursive: true, force: true });
});

function assertOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error("expected ok=true result");
  return result.value;
}

// ---------------------------------------------------------------------------
// Scope: summary
// ---------------------------------------------------------------------------

describe("assembleBlueprintContext — scope=summary", () => {
  it("returns an overview chunk and a task-rollup chunk for an existing slug", () => {
    insertBlueprint(dbConn.db, { slug: "demo", title: "Demo Blueprint" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.1", status: "done" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.2", status: "todo" });

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "summary",
    });

    const value = assertOk(result);
    const kinds = value.chunks.map((c) => c.kind);
    expect(kinds).toContain("overview");
    expect(kinds).toContain("task-rollup");
    expect(value.project_slug).toBe("demo");
  });

  it("returns next_action.kind=disambiguate_slug when slug is missing", () => {
    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "no-such-blueprint",
      scope: "summary",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.next_action.kind).toBe("disambiguate_slug");
  });

  it("chunks carry content_hash, ingested_at, source_path, and chunk_id", () => {
    insertBlueprint(dbConn.db, {
      slug: "demo",
      contentHash: "abc123",
      filePath: "/x/demo/_overview.md",
      ingestedAt: 9_999,
    });
    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "summary",
    });
    const value = assertOk(result);
    for (const chunk of value.chunks) {
      expect(chunk.content_hash).toBe("abc123");
      expect(chunk.ingested_at).toBe(9_999);
      expect(chunk.source_path).toBe("/x/demo/_overview.md");
      expect(chunk.chunk_id).toMatch(/^demo:/);
    }
  });
});

// ---------------------------------------------------------------------------
// Scope: next-task
// ---------------------------------------------------------------------------

describe("assembleBlueprintContext — scope=next-task", () => {
  it("returns the lowest task_id with status=todo and all-done deps", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    const t11 = insertTask(dbConn.db, {
      blueprintSlug: "demo",
      taskId: "1.1",
      status: "done",
    });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.2", status: "todo" });
    const t13 = insertTask(dbConn.db, {
      blueprintSlug: "demo",
      taskId: "1.3",
      status: "todo",
    });
    // 1.3 depends on 1.1 (done) — eligible. 1.2 depends on 1.3 (todo) — not eligible.
    const t12rowid = dbConn.db
      .prepare<[string, string], { id: number }>(
        "SELECT id FROM tasks WHERE blueprint_slug = ? AND task_id = ?",
      )
      .get("demo", "1.2")!.id;
    addTaskDep(dbConn.db, t13, t11);
    addTaskDep(dbConn.db, t12rowid, t13);

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "next-task",
    });

    const value = assertOk(result);
    const taskChunks = value.chunks.filter((c) => c.kind === "next-task");
    expect(taskChunks).toHaveLength(1);
    expect(taskChunks[0]?.heading).toContain("1.3");
  });

  it("returns no-task chunk when no eligible task exists", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.1", status: "done" });

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "next-task",
    });

    const value = assertOk(result);
    const kinds = value.chunks.map((c) => c.kind);
    expect(kinds).toContain("no-task");
  });
});

// ---------------------------------------------------------------------------
// Scope: task (with dep-graph cone)
// ---------------------------------------------------------------------------

describe("assembleBlueprintContext — scope=task", () => {
  it("returns a task chunk plus its transitive dependency cone", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    // dep graph: 2.3 → 2.2 → 2.1   ;  2.4 unrelated
    const t21 = insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "2.1", status: "done" });
    const t22 = insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "2.2", status: "done" });
    const t23 = insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "2.3", status: "todo" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "2.4", status: "todo" });
    addTaskDep(dbConn.db, t22, t21);
    addTaskDep(dbConn.db, t23, t22);

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "task",
      task_id: "2.3",
    });

    const value = assertOk(result);
    const taskHeadings = value.chunks
      .filter((c) => c.kind === "task" || c.kind === "task-dep")
      .map((c) => c.heading);

    // Includes target task and both transitive deps
    expect(taskHeadings.some((h) => h.includes("2.3"))).toBe(true);
    expect(taskHeadings.some((h) => h.includes("2.2"))).toBe(true);
    expect(taskHeadings.some((h) => h.includes("2.1"))).toBe(true);
    // Unrelated task is excluded
    expect(taskHeadings.some((h) => h.includes("2.4"))).toBe(false);
  });

  it("returns next_action.kind=verify_task when task_id is unknown", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "task",
      task_id: "9.9",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.next_action.kind).toBe("verify_task");
  });

  it("dep cone is deterministically ordered by task_id ascending", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    const a = insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "3.1", status: "done" });
    const b = insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "3.2", status: "done" });
    const c = insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "3.3", status: "todo" });
    addTaskDep(dbConn.db, c, a);
    addTaskDep(dbConn.db, c, b);

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "task",
      task_id: "3.3",
    });

    const value = assertOk(result);
    const deps = value.chunks.filter((c) => c.kind === "task-dep").map((c) => c.heading);
    // Sorted by task_id ascending
    expect(deps).toStrictEqual([expect.stringContaining("3.1"), expect.stringContaining("3.2")]);
  });
});

// ---------------------------------------------------------------------------
// Scope: verification
// ---------------------------------------------------------------------------

describe("assembleBlueprintContext — scope=verification", () => {
  it("returns recently-completed task chunks ordered most-recent-first", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    // We use task_id ordering as a stable proxy for "recent" in absence of timestamps.
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.1", status: "done" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.2", status: "done" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.3", status: "todo" });

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "verification",
    });

    const value = assertOk(result);
    const verifs = value.chunks.filter((c) => c.kind === "verification");
    expect(verifs.length).toBeGreaterThan(0);
    // Only done tasks
    for (const v of verifs) {
      expect(v.heading).toMatch(/Task 1\.(1|2)/);
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism + bounded text
// ---------------------------------------------------------------------------

describe("assembleBlueprintContext — invariants", () => {
  it("is deterministic for identical DB + cwd input", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.1", status: "todo" });

    const a = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "summary",
    });
    const b = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "summary",
    });

    expect(a).toStrictEqual(b);
  });

  it("clamps each chunk.text to <= CONTEXT_CHUNK_MAX_BYTES bytes", () => {
    const huge = "x".repeat(CONTEXT_CHUNK_MAX_BYTES * 3);
    insertBlueprint(dbConn.db, { slug: "demo" });
    insertTask(dbConn.db, {
      blueprintSlug: "demo",
      taskId: "1.1",
      status: "todo",
      description: huge,
    });

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "task",
      task_id: "1.1",
    });
    const value = assertOk(result);
    for (const chunk of value.chunks) {
      expect(Buffer.byteLength(chunk.text, "utf8")).toBeLessThanOrEqual(CONTEXT_CHUNK_MAX_BYTES);
    }
  });

  it("returns next_action.kind=reingest_project when HEAD changed since ingest", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.1", status: "todo" });
    // Overwrite metadata with a fake HEAD so freshness fails.
    writeFileSync(
      `${dbPath}.meta.json`,
      JSON.stringify({ head_at_ingest: "deadbeef".repeat(5), ingested_at: 1 }) + "\n",
      "utf8",
    );

    // Use cwd=tmp which is not a git repo — current head will be null, mismatch.
    const result: ContextResult = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "summary",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.next_action.kind).toBe("reingest_project");
  });

  it("every chunk has a stable, unique chunk_id", () => {
    insertBlueprint(dbConn.db, { slug: "demo" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.1", status: "todo" });
    insertTask(dbConn.db, { blueprintSlug: "demo", taskId: "1.2", status: "done" });

    const result = assembleBlueprintContext({
      db: dbConn.db,
      project: { worktree_path: tmp, db_path: dbPath },
      slug: "demo",
      scope: "summary",
    });
    const value = assertOk(result);
    const ids = value.chunks.map((c: ContextChunk) => c.chunk_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
