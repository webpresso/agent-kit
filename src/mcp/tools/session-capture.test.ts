import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import sessionCaptureTool from "./session-capture.js";
import sessionRestoreTool from "./session-restore.js";
import { resolveSessionRepoHash } from "../../session-memory/repo-hash.js";
import { SessionMemorySessionStore } from "../../session-memory/session.js";

const dirs: string[] = [];

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ak-mcp-session-capture-"));
  dirs.push(dir);
  return {
    cwd: dir,
    sessionDbPath: join(dir, "sessions.sqlite"),
    repoHash: resolveSessionRepoHash(dir),
  };
}

afterEach(() => {
  delete process.env.WEBPRESSO_SESSION_MEMORY;
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("wp_session_capture", () => {
  it("captures typed continuity content into the restore-visible session store", async () => {
    const { cwd, sessionDbPath, repoHash } = fixture();
    const result = await sessionCaptureTool.handler!({
      cwd,
      sessionDbPath,
      content: "important typed continuity note",
      toolName: "manual",
      sessionId: "manual-session",
    });

    expect(result.structuredContent).toMatchObject({
      captured: true,
      capturedEventCount: 1,
      toolName: "manual",
      capturedLength: "important typed continuity note".length,
      truncated: false,
    });
    expect((result.structuredContent as { eventId?: string }).eventId).toMatch(/^evt_/);

    const store = new SessionMemorySessionStore(sessionDbPath);
    try {
      expect(store.restore({ repoHash, query: "typed continuity", limit: 5 })[0]).toMatchObject({
        sessionId: "manual-session",
        eventType: "assistant_turn_summary",
        toolName: "manual",
        content: "important typed continuity note",
      });
    } finally {
      store.close();
    }
  });

  it("round-trips through the public capture and restore MCP tools", async () => {
    const { cwd, sessionDbPath } = fixture();
    await sessionCaptureTool.handler!({
      cwd,
      sessionDbPath,
      content: "public capture restore bridge proof",
      toolName: "manual",
    });

    const restored = await sessionRestoreTool.handler!({
      cwd,
      sessionDbPath,
      query: "bridge proof",
      limit: 5,
    });
    expect(restored.isError).not.toBe(true);
    expect(restored.structuredContent).toMatchObject({
      passed: true,
      counts: { continuityEventCount: 1, warningCount: 0 },
    });
    expect(JSON.stringify(restored.structuredContent)).toContain(
      "public capture restore bridge proof",
    );
  });

  it("does not open the store when capture is disabled", async () => {
    process.env.WEBPRESSO_SESSION_MEMORY = "0";
    const { cwd, sessionDbPath } = fixture();
    const result = await sessionCaptureTool.handler!({ cwd, sessionDbPath, content: "disabled" });

    expect(result.structuredContent).toMatchObject({
      captured: false,
      capturedEventCount: 0,
    });
  });
});
