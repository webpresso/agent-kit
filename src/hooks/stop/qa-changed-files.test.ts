import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionMemorySessionStore } from "../../session-memory/session.js";
import * as stopQa from "./qa-changed-files.js";

type StopHookOutputBuilder = (
  input: unknown,
  cwd: string,
  env: Record<string, string | undefined>,
  deps?: {
    dbPath?: string;
    now?: () => Date;
    repoHash?: (projectDir: string) => string;
    getChangedFiles?: (projectDir: string) => string[];
    runQaChecks?: (qaFiles: string[], projectDir: string) => string[];
  },
) => unknown;

const dirs: string[] = [];

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "wp-stop-"));
  dirs.push(dir);
  return dir;
}

function getStopHookOutputBuilder(): StopHookOutputBuilder {
  const maybeBuilder = (stopQa as unknown as { buildStopHookOutput?: StopHookOutputBuilder })
    .buildStopHookOutput;
  expect(typeof maybeBuilder).toBe("function");
  return maybeBuilder as StopHookOutputBuilder;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("formatStopHookOutput", () => {
  it("emits systemMessage at top level (not wrapped in hookSpecificOutput)", () => {
    const json = stopQa.formatStopHookOutput({
      systemMessage: "QA gate failed on changed files: Typecheck failed:",
    });
    const output = JSON.parse(json);
    expect(output.systemMessage).toContain("QA gate failed");
    expect(output.hookSpecificOutput).toBeUndefined();
  });

  it("produces valid JSON stdout (Codex mandates JSON-only for Stop — plain text is invalid)", () => {
    const json = stopQa.formatStopHookOutput({ systemMessage: "all checks passed" });
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(typeof parsed["systemMessage"]).toStrictEqual("string");
  });
});

describe("buildStopHookOutput continuity capture", () => {
  it("persists a bounded assistant turn summary for changed files", () => {
    const root = tmp();
    const dbPath = join(root, "sessions.sqlite");
    const longChangedFiles = Array.from(
      { length: 60 },
      (_value, index) =>
        `src/generated/${String(index).padStart(2, "0")}-${"very-long-file-name-".repeat(8)}.ts`,
    );
    const buildStopHookOutput = getStopHookOutputBuilder();

    const output = buildStopHookOutput(
      {
        agent_id: "agent-1",
        cwd: root,
        hook_event_name: "Stop",
        session_id: "session-1",
        turn_id: "turn-99",
      },
      root,
      {},
      {
        dbPath,
        getChangedFiles: () => longChangedFiles,
        now: () => new Date("2026-06-13T12:00:00.000Z"),
        repoHash: () => "repo123456789abcd",
      },
    );

    expect(JSON.parse(stopQa.formatStopHookOutput(output as never))).toStrictEqual({});

    const store = new SessionMemorySessionStore(dbPath);
    const restored = store.restore({
      repoHash: "repo123456789abcd",
      query: "changed files turn summary",
      limit: 1,
    })[0];
    store.close();

    expect(restored).toMatchObject({
      eventType: "assistant_turn_summary",
      toolName: "Stop",
      sessionId: "session-1",
      priority: 70,
      metadata: {
        source: "stop-hook",
        hookEventName: "Stop",
        turnId: "turn-99",
        changedFileCount: longChangedFiles.length,
      },
    });
    expect(Buffer.byteLength(restored.content, "utf8")).toBeLessThanOrEqual(2048);
    expect(restored.summary).toContain("Changed files");
  });

  it("fails open with JSON-only empty output when git or repo discovery is unavailable", () => {
    const root = tmp();
    const buildStopHookOutput = getStopHookOutputBuilder();

    const output = buildStopHookOutput(
      {},
      root,
      {},
      {
        getChangedFiles: () => {
          throw new Error("not a git repository");
        },
        repoHash: () => {
          throw new Error("not a git repository");
        },
      },
    );

    expect(stopQa.formatStopHookOutput(output as never)).toBe("{}");
  });

  it("captures hook-provided assistant summaries without git discovery", () => {
    const root = tmp();
    const dbPath = join(root, "sessions.sqlite");
    const buildStopHookOutput = getStopHookOutputBuilder();

    const output = buildStopHookOutput(
      {
        agent_id: "agent-1",
        changed_files: ["src/hooks/stop/qa-changed-files.ts"],
        last_assistant_message: "Implemented Stop continuity capture and kept deferred QA off.",
        session_id: "session-1",
      },
      root,
      {},
      {
        dbPath,
        now: () => new Date("2026-06-13T12:00:00.000Z"),
        repoHash: () => "repo123456789abcd",
      },
    );

    expect(stopQa.formatStopHookOutput(output as never)).toBe("{}");

    const store = new SessionMemorySessionStore(dbPath);
    const restored = store.restore({
      repoHash: "repo123456789abcd",
      query: "deferred QA",
      limit: 1,
    })[0];
    store.close();

    expect(restored).toMatchObject({
      eventType: "assistant_turn_summary",
      toolName: "Stop",
      metadata: {
        source: "stop-hook",
        changedFileCount: 1,
      },
    });
    expect(restored.content).toContain("Implemented Stop continuity capture");
  });

  it("does not run deferred QA checks on the Stop hot path", () => {
    const root = tmp();
    const buildStopHookOutput = getStopHookOutputBuilder();
    const runQaChecks = vi.fn(() => ["would block"]);

    const output = buildStopHookOutput(
      { cwd: root },
      root,
      {},
      {
        dbPath: join(root, "sessions.sqlite"),
        getChangedFiles: () => ["src/hooks/stop/qa-changed-files.ts"],
        repoHash: () => "repo123456789abcd",
        runQaChecks,
      },
    );

    expect(JSON.parse(stopQa.formatStopHookOutput(output as never))).toStrictEqual({});
    expect(runQaChecks).not.toHaveBeenCalled();
  });
});

describe("buildTestCommand / buildTypecheckCommand", () => {
  it("returns null for empty file lists", () => {
    expect(stopQa.buildTestCommand([])).toBeNull();
    expect(stopQa.buildTypecheckCommand([])).toBeNull();
  });

  it("single-quotes file paths so $-prefixed segments are not shell-expanded", () => {
    const path =
      "apps/web/app/routes/_dashboard/organizations.$orgSlug.projects.$projectSlug.analytics.test.tsx";
    expect(stopQa.buildTestCommand([path])).toBe(`just test --file '${path}'`);
    expect(stopQa.buildTypecheckCommand([path])).toBe(`just typecheck --file '${path}'`);
  });

  it("joins multiple files", () => {
    expect(stopQa.buildTestCommand(["a.test.ts", "b.test.ts"])).toBe(
      "just test --file 'a.test.ts' --file 'b.test.ts'",
    );
  });
});
