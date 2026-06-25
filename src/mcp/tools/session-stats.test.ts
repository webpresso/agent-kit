import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import sessionStatsTool from "./session-stats.js";
import { SessionMemorySessionStore } from "../../session-memory/session.js";
import { SessionMemoryStore } from "../../session-memory/store.js";

const dirs: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ak-mcp-session-stats-"));
  dirs.push(dir);
  return { sessionDbPath: join(dir, "sessions.sqlite"), indexDbPath: join(dir, "index.sqlite") };
}
function payload(result: Awaited<ReturnType<typeof sessionStatsTool.handler>>) {
  return result.structuredContent as {
    passed: boolean;
    counts: { eventCount: number; chunkCount: number; sourceCount: number; repoCount: number };
    sources: string[];
  };
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("wp_session_stats tool", () => {
  it("exposes a local-only stats descriptor and returns bounded counts", async () => {
    expect(sessionStatsTool.name).toBe("wp_session_stats");
    expect(sessionStatsTool.annotations?.readOnlyHint).toBe(true);
    expect(sessionStatsTool.annotations?.openWorldHint).toBe(false);
    const { sessionDbPath, indexDbPath } = fixture();
    const sessionStore = new SessionMemorySessionStore(sessionDbPath);
    sessionStore.captureEvent({
      repoHash: "repo123456789abcd",
      event: { eventType: "decision", toolName: "tool", content: "stats memory" },
    });
    sessionStore.close();
    const indexStore = new SessionMemoryStore(indexDbPath);
    indexStore.indexChunk({ id: "chunk-a", source: "web:a", text: "stats chunk" });
    indexStore.close();

    const data = payload(await sessionStatsTool.handler({ sessionDbPath, indexDbPath }));
    expect(data.passed).toBe(true);
    expect(data.counts).toMatchObject({
      eventCount: 1,
      chunkCount: 1,
      sourceCount: 1,
      repoCount: 1,
    });
    expect(data.sources).toEqual(["web:a"]);
  });
});
