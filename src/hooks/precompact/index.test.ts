import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SessionMemorySessionStore } from "../../session-memory/session.js";

import { buildOutput, formatPreCompactOutput, resolveSessionMemoryDbPath } from "./index.js";

const dirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "wp-precompact-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("precompact hook buildOutput", () => {
  it("captures a compaction boundary, snapshots it, and emits only vendor-safe empty JSON", () => {
    const root = tmp();
    const dbPath = join(root, "sessions.sqlite");

    const output = buildOutput(
      {
        hook_event_name: "PreCompact",
        cwd: root,
        session_id: "session-1",
        trigger: "auto",
        turn_id: "turn-1",
        model: "test-model",
      },
      root,
      {},
      {
        dbPath,
        repoHash: () => "repo123456789abcd",
        now: () => new Date("2026-06-13T00:00:00.000Z"),
      },
    );

    expect(formatPreCompactOutput(output)).toBe("{}");

    const store = new SessionMemorySessionStore(dbPath);
    expect(
      store.restore({ repoHash: "repo123456789abcd", query: "compaction boundary", limit: 1 })[0],
    ).toMatchObject({
      eventType: "compaction_boundary",
      toolName: "PreCompact",
    });
    store.close();
  });

  it("fails open with an empty JSON object when storage throws", () => {
    const output = buildOutput(
      {},
      tmp(),
      {},
      {
        createStore: () => {
          throw new Error("db unavailable");
        },
      },
    );
    expect(formatPreCompactOutput(output)).toBe("{}");
  });

  it("uses bounded snapshot settings without writing host-specific additional context", () => {
    const root = tmp();
    const snapshotInputs: unknown[] = [];
    const output = buildOutput(
      { session_id: "session-2" },
      root,
      { WP_PRECOMPACT_MAX_SNAPSHOT_BYTES: "512" },
      {
        dbPath: join(root, "sessions.sqlite"),
        repoHash: () => "repo123456789abcd",
        createStore: () => ({
          captureEvent: () => "evt",
          snapshot: (input: unknown) => {
            snapshotInputs.push(input);
            return {
              snapshotId: "snap",
              sessionId: "session-2",
              status: "partial",
              eventCount: 1,
              content: "x".repeat(10_000),
            };
          },
          close: () => undefined,
        }),
      },
    );
    expect(formatPreCompactOutput(output)).toBe("{}");
    expect(snapshotInputs[0]).toMatchObject({
      repoHash: "repo123456789abcd",
      sessionId: "session-2",
      maxSnapshotBytes: 512,
    });
  });

  it("uses explicit session-memory env paths before state-root resolution", () => {
    const root = tmp();
    expect(
      resolveSessionMemoryDbPath(root, { WP_SESSION_MEMORY_DB: join(root, "explicit.sqlite") }),
    ).toBe(join(root, "explicit.sqlite"));
    expect(resolveSessionMemoryDbPath(root, { WP_SESSION_MEMORY_DIR: join(root, "dir") })).toBe(
      join(root, "dir", "sessions.sqlite"),
    );
  });
});
