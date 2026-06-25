import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Database } from "#db/sqlite.js";

import { SESSION_MEMORY_SCHEMA_VERSION, SessionMemorySessionStore } from "./session.js";

const dirs: string[] = [];
function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ak-session-migration-"));
  dirs.push(dir);
  return join(dir, "sessions.sqlite");
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function createFlatSchemaDatabase(path: string, options: { seedFts?: boolean } = {}): Database {
  const seedFts = options.seedFts ?? true;
  const db = new Database(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE sessions (
      agent_id TEXT NOT NULL,
      snapshot_id TEXT PRIMARY KEY,
      repo_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      content_json TEXT NOT NULL
    );
    CREATE TABLE session_events (
      session_id TEXT NOT NULL,
      event_id TEXT PRIMARY KEY,
      repo_hash TEXT NOT NULL,
      ts TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE session_events_fts
      USING fts5(session_id UNINDEXED, event_id UNINDEXED, repo_hash UNINDEXED, tool_name UNINDEXED, content, tokenize='porter');
  `);
  db.prepare<[string, string, string, string, string, string]>(
    `INSERT INTO session_events (session_id, event_id, repo_hash, ts, tool_name, content)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    "repo123456789abcd:default",
    "flat-event",
    "repo123456789abcd",
    "2026-06-13T00:00:00.000Z",
    "edit",
    "flat searchable continuity payload",
  );
  if (seedFts) {
    db.prepare<[string, string, string, string, string]>(
      "INSERT INTO session_events_fts (session_id, event_id, repo_hash, tool_name, content) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "repo123456789abcd:default",
      "flat-event",
      "repo123456789abcd",
      "edit",
      "flat searchable continuity payload",
    );
  }
  return db;
}

describe("session-memory schema migration", () => {
  it("migrates old flat event schemas into typed continuity rows", () => {
    const path = dbPath();
    const flatHandle = createFlatSchemaDatabase(path);
    flatHandle.close();

    const store = new SessionMemorySessionStore(path);
    expect(
      store.restore({ repoHash: "repo123456789abcd", query: "searchable", limit: 1 })[0],
    ).toMatchObject({
      eventId: "flat-event",
      eventType: "tool_command",
      toolName: "edit",
      content: "flat searchable continuity payload",
      priority: 50,
      metadata: {},
    });
    store.close();

    const migrated = new Database(path);
    expect(migrated.prepare<[], { user_version: number }>("PRAGMA user_version").get()).toEqual({
      user_version: SESSION_MEMORY_SCHEMA_VERSION,
    });
    expect(
      migrated
        .prepare<[], { count: number }>(
          "SELECT COUNT(*) AS count FROM session_events_fts WHERE event_id = 'flat-event'",
        )
        .get()?.count,
    ).toBe(1);
    expect(
      migrated
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_session_events_repo_session_ts'",
        )
        .get()?.name,
    ).toBe("idx_session_events_repo_session_ts");
    migrated.close();

    const reopened = new SessionMemorySessionStore(path);
    expect(
      reopened.restore({ repoHash: "repo123456789abcd", query: "searchable", limit: 1 }),
    ).toHaveLength(1);
    reopened.close();
  });

  it("opens current schema idempotently without rewriting user_version", () => {
    const path = dbPath();
    const first = new SessionMemorySessionStore(path);
    first.captureEvent({
      repoHash: "repo123456789abcd",
      event: {
        eventId: "current-event",
        eventType: "decision",
        toolName: "UserPromptSubmit",
        content: "current schema remains searchable after reopening",
      },
    });
    first.close();

    const db = new Database(path);
    expect(db.prepare<[], { user_version: number }>("PRAGMA user_version").get()).toEqual({
      user_version: SESSION_MEMORY_SCHEMA_VERSION,
    });
    db.close();

    const second = new SessionMemorySessionStore(path);
    expect(
      second.restore({ repoHash: "repo123456789abcd", query: "searchable", limit: 1 })[0],
    ).toMatchObject({ eventId: "current-event", eventType: "decision" });
    second.close();
  });
});
