import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SessionMemorySessionStore } from "../../session-memory/session.js";
import { DEFAULT_MAX_PROMPT_CAPTURE_BYTES, processGuardSwitchInput } from "./index.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "wp-guard-switch-"));
  tempDirs.push(dir);
  return join(dir, "sessions.sqlite");
}

describe("processGuardSwitchInput", () => {
  it("preserves guard off state mutation with a host-safe JSON block decision", () => {
    const states: boolean[] = [];
    const captured: unknown[] = [];
    const result = processGuardSwitchInput(
      { prompt: " guard off " },
      "/repo",
      {},
      {
        setGuardEnabled: (enabled) => states.push(enabled),
        createStore: () => ({
          captureEvent: (input: unknown) => {
            captured.push(input);
            return "evt";
          },
          close: () => undefined,
        }),
      },
    );

    expect(result).toStrictEqual({
      decision: "block",
      reason: "🛡️ Guard disabled — pretool validators will be skipped",
    });
    expect(states).toStrictEqual([false]);
    expect(captured).toStrictEqual([]);
  });

  it("preserves guard on state mutation with a host-safe JSON block decision", () => {
    const states: boolean[] = [];
    const result = processGuardSwitchInput(
      { prompt: "GUARD ON" },
      "/repo",
      {},
      { setGuardEnabled: (enabled) => states.push(enabled) },
    );

    expect(result).toStrictEqual({
      decision: "block",
      reason: "🛡️ Guard enabled — pretool validators active",
    });
    expect(states).toStrictEqual([true]);
  });

  it("captures prompt, decision, and constraint events as bounded continuity events", () => {
    const dbPath = tempDb();
    const store = new SessionMemorySessionStore(dbPath);
    const captured: unknown[] = [];

    const result = processGuardSwitchInput(
      {
        hook_event_name: "UserPromptSubmit",
        session_id: "session-1",
        prompt:
          "Decision: keep the API minimal\nConstraint: do not add dependencies\nPlease implement the hook.",
      },
      "/repo",
      {},
      {
        dbPath,
        repoHash: () => "repo123456789abcd",
        now: () => new Date("2026-06-13T00:00:00.000Z"),
        createStore: () => ({
          captureEvent: (input: unknown) => {
            captured.push(input);
            return store.captureEvent(
              input as Parameters<SessionMemorySessionStore["captureEvent"]>[0],
            );
          },
          close: () => undefined,
        }),
      },
    );

    expect(result).toStrictEqual({});
    expect(captured).toHaveLength(3);
    expect(
      captured.map((entry) => (entry as { event: { eventType: string } }).event.eventType),
    ).toStrictEqual(["user_prompt", "decision", "constraint"]);
    expect(
      store.restore({ repoHash: "repo123456789abcd", query: "decision minimal", limit: 1 })[0]
        ?.eventType,
    ).toBe("decision");
    expect(
      store.restore({
        repoHash: "repo123456789abcd",
        query: "constraint dependencies",
        limit: 1,
      })[0]?.eventType,
    ).toBe("constraint");
    store.close();
  });

  it("redacts secret-looking prompt fragments and byte-caps oversized capture", () => {
    const captured: unknown[] = [];
    const result = processGuardSwitchInput(
      { prompt: `Decision: TOKEN=super-secret-value\n${"x".repeat(10_000)}` },
      "/repo",
      {},
      {
        repoHash: () => "repo123456789abcd",
        createStore: () => ({
          captureEvent: (input: unknown) => {
            captured.push(input);
            return "evt";
          },
          close: () => undefined,
        }),
      },
    );

    expect(result).toStrictEqual({});
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain("super-secret-value");
    expect(serialized).toContain("[REDACTED]");
    expect(
      Buffer.byteLength(
        (captured[0] as { event: { content: string; metadata?: { truncated?: boolean } } }).event
          .content,
        "utf8",
      ),
    ).toBeLessThanOrEqual(DEFAULT_MAX_PROMPT_CAPTURE_BYTES);
    expect(
      (captured[0] as { event: { metadata?: { truncated?: boolean } } }).event.metadata,
    ).toMatchObject({
      truncated: true,
    });
  });

  it("degrades malformed or storage-failing input to a host-safe no-op", () => {
    expect(processGuardSwitchInput(null, "/repo")).toStrictEqual({});
    expect(processGuardSwitchInput({ prompt: "" }, "/repo")).toStrictEqual({});
    expect(
      processGuardSwitchInput(
        { prompt: "normal prompt" },
        "/repo",
        {},
        {
          createStore: () => {
            throw new Error("db down");
          },
        },
      ),
    ).toStrictEqual({});
  });
});
