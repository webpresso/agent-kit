import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import sessionRestoreTool from "./session-restore.js";
import { SessionMemorySessionStore } from "../../session-memory/session.js";
import { SessionMemoryStore } from "../../session-memory/store.js";

const dirs: string[] = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ak-mcp-session-restore-"));
  dirs.push(dir);
  return {
    sessionDbPath: join(dir, "sessions.sqlite"),
    indexDbPath: join(dir, "index.sqlite"),
  };
}

function payload(result: Awaited<ReturnType<typeof sessionRestoreTool.handler>>) {
  return result.structuredContent as {
    passed: boolean;
    summary: string;
    counts: {
      resultCount: number;
      continuityEventCount: number;
      indexedChunkCount: number;
      warningCount: number;
    };
    results: Array<{
      sourceType: "continuity_event" | "indexed_chunk";
      provenance: {
        kind: string;
        id: string;
        source?: string;
        repoHash?: string;
        eventId?: string;
      };
      dedupeKey: string;
      score: number;
      tier: string;
      timestamp: string;
      preview: string;
      metadata: Record<string, unknown>;
    }>;
    warnings: string[];
  };
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("wp_session_restore tool", () => {
  it("exposes a strict public restore descriptor", () => {
    expect(sessionRestoreTool.name).toBe("wp_session_restore");
    expect(typeof sessionRestoreTool.handler).toBe("function");
    expect(sessionRestoreTool.annotations?.destructiveHint).toBe(false);
    expect(sessionRestoreTool.annotations?.openWorldHint).toBe(false);
    expect(() =>
      sessionRestoreTool.inputSchema.parse({
        repoHash: "repo123456789abcd",
        query: "memory",
        extra: true,
      }),
    ).toThrow();
  });

  it("restores continuity events as bounded preview-only provenance records", async () => {
    const { sessionDbPath, indexDbPath } = fixture();
    const sessionStore = new SessionMemorySessionStore(sessionDbPath);
    sessionStore.captureEvent({
      repoHash: "repo123456789abcd",
      sessionId: "session-a",
      event: {
        eventId: "evt-restore-1",
        ts: "2026-06-13T00:00:00.000Z",
        eventType: "decision",
        toolName: "UserPromptSubmit",
        content: `${"bounded continuity decision ".repeat(20)}hidden-restore-overflow`,
        summary: "Decision: restore continuity",
        priority: 90,
      },
    });
    sessionStore.close();

    const result = await sessionRestoreTool.handler({
      sessionDbPath,
      indexDbPath,
      repoHash: "repo123456789abcd",
      query: "continuity hidden-restore-overflow",
      maxPreviewBytes: 64,
      limit: 5,
    });
    const data = payload(result);

    expect(data.passed).toBe(true);
    expect(data.counts).toMatchObject({
      resultCount: 1,
      continuityEventCount: 1,
      indexedChunkCount: 0,
    });
    expect(data.results[0]).toMatchObject({
      sourceType: "continuity_event",
      provenance: {
        kind: "continuity_event",
        repoHash: "repo123456789abcd",
        eventId: "evt-restore-1",
      },
      tier: "event_fts",
      timestamp: "2026-06-13T00:00:00.000Z",
    });
    expect(data.results[0]?.preview.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(result)).not.toContain("hidden-restore-overflow");
  });

  it("honors source type and chunk source filters without echoing raw chunk content", async () => {
    const { sessionDbPath, indexDbPath } = fixture();
    const chunkStore = new SessionMemoryStore(indexDbPath);
    chunkStore.indexChunk({
      id: "chunk-docs",
      source: "web:docs",
      text: `${"replacement parity docs ".repeat(20)}hidden-docs-overflow`,
    });
    chunkStore.indexChunk({
      id: "chunk-other",
      source: "web:other",
      text: "replacement parity other",
    });
    chunkStore.close();

    const result = await sessionRestoreTool.handler({
      sessionDbPath,
      indexDbPath,
      repoHash: "repo123456789abcd",
      query: "replacement parity hidden-docs-overflow",
      source: "web:docs",
      sourceTypes: ["indexed_chunk"],
      maxPreviewBytes: 48,
      limit: 10,
    });
    const data = payload(result);

    expect(data.passed).toBe(true);
    expect(data.results).toHaveLength(1);
    expect(data.results[0]).toMatchObject({
      sourceType: "indexed_chunk",
      provenance: { kind: "indexed_chunk", id: "chunk-docs", source: "web:docs" },
    });
    expect(data.results[0]?.preview.length).toBeLessThanOrEqual(48);
    expect(JSON.stringify(result)).not.toContain("hidden-docs-overflow");
    expect(JSON.stringify(result)).not.toContain(
      "replacement parity docs replacement parity docs replacement parity docs",
    );
  });

  it("returns bounded no-result responses for empty or malformed recall queries", async () => {
    const { sessionDbPath, indexDbPath } = fixture();
    const empty = await sessionRestoreTool.handler({
      sessionDbPath,
      indexDbPath,
      repoHash: "repo123456789abcd",
      query: "   ",
    });
    expect(empty.isError).toBe(true);
    expect(payload(empty)).toMatchObject({ passed: false, counts: { resultCount: 0 } });

    const malformed = await sessionRestoreTool.handler({
      sessionDbPath,
      indexDbPath,
      repoHash: "repo123456789abcd",
      query: '""""',
    });
    expect(malformed.isError).toBe(true);
    expect(payload(malformed)).toMatchObject({ passed: false, counts: { resultCount: 0 } });
  });
});
