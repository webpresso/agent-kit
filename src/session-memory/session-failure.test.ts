import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SessionMemorySessionStore } from "./session.js";

const dirs: string[] = [];
function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "ak-session-failure-"));
  dirs.push(dir);
  return join(dir, "sessions.sqlite");
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("SessionMemorySessionStore failure continuity events", () => {
  it("captures failures and rejected approaches as searchable typed events", () => {
    const store = new SessionMemorySessionStore(dbPath());
    store.captureEvent({
      repoHash: "repo123456789abcd",
      event: {
        eventId: "evt-failure",
        eventType: "failure",
        toolName: "Bash",
        content: "Typecheck failed because the continuity envelope omitted metadata.",
        summary: "Typecheck failed on continuity metadata",
        priority: 95,
      },
    });
    store.captureEvent({
      repoHash: "repo123456789abcd",
      event: {
        eventId: "evt-rejected",
        eventType: "rejected_approach",
        toolName: "Assistant",
        content: "Rejected adding a second continuity daemon; SQLite local store is enough.",
        priority: 70,
      },
    });

    expect(
      store.restore({ repoHash: "repo123456789abcd", query: "metadata", limit: 1 })[0],
    ).toMatchObject({ eventType: "failure", eventId: "evt-failure" });
    expect(
      store.restore({ repoHash: "repo123456789abcd", query: "daemon", limit: 1 })[0],
    ).toMatchObject({ eventType: "rejected_approach", eventId: "evt-rejected" });

    store.close();
  });

  it("captures assistant turn summaries as searchable typed events", () => {
    const store = new SessionMemorySessionStore(dbPath());
    store.captureEvent({
      repoHash: "repo123456789abcd",
      event: {
        eventId: "evt-assistant-summary",
        eventType: "assistant_turn_summary",
        toolName: "Assistant",
        content: "Summarized current implementation state and remaining verifier blockers.",
        summary: "Implementation state plus verifier blockers",
        priority: 85,
      },
    });

    expect(
      store.restore({ repoHash: "repo123456789abcd", query: "verifier blockers", limit: 1 })[0],
    ).toMatchObject({
      eventType: "assistant_turn_summary",
      eventId: "evt-assistant-summary",
      summary: "Implementation state plus verifier blockers",
    });

    store.close();
  });

  it("captures command events as searchable typed events", () => {
    const store = new SessionMemorySessionStore(dbPath());
    store.captureEvent({
      repoHash: "repo123456789abcd",
      event: {
        eventId: "evt-command",
        eventType: "tool_command",
        toolName: "Bash",
        content: "Ran ./bin/wp typecheck and found continuity metadata errors.",
        summary: "Typecheck surfaced metadata errors",
        priority: 75,
        metadata: { exitCode: 1 },
      },
    });

    expect(
      store.restore({ repoHash: "repo123456789abcd", query: "typecheck metadata", limit: 1 })[0],
    ).toMatchObject({
      eventType: "tool_command",
      eventId: "evt-command",
      metadata: { exitCode: 1 },
    });

    store.close();
  });

  it("preserves compaction boundaries in bounded snapshots", () => {
    const store = new SessionMemorySessionStore(dbPath());
    store.captureEvent({
      repoHash: "repo123456789abcd",
      event: {
        eventId: "evt-compact-boundary",
        eventType: "compaction_boundary",
        toolName: "PreCompact",
        content: "Compaction boundary before host context reduction.",
        summary: "Pre-compaction boundary",
        priority: 100,
        metadata: { reason: "host_compaction" },
      },
    });

    const snapshot = store.snapshot({ repoHash: "repo123456789abcd", maxSnapshotBytes: 1000 });
    expect(snapshot.content).toContain('"eventType":"compaction_boundary"');
    expect(snapshot.content).toContain('"summary":"Pre-compaction boundary"');
    expect(snapshot.content).toContain('"reason":"host_compaction"');

    store.close();
  });
});
