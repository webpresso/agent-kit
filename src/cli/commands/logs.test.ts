import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stateRoot = vi.hoisted(() => ({ path: "" }));

vi.mock("#paths/state-root.js", () => ({
  getSurfacePath: vi.fn((name: string, _scope: "repo" | "worktree" | "user") =>
    join(stateRoot.path, name),
  ),
}));

import { registerLogsCommand } from "./logs.js";
import { createCliLogSink } from "./quality-log-store.js";

function buildFakeCli() {
  let registeredAction: ((command: string, ordinal?: string) => number) | undefined;
  const options: string[] = [];
  const chain = {
    option: (name: string) => {
      options.push(name);
      return chain;
    },
    action: (fn: typeof registeredAction) => {
      registeredAction = fn;
      return chain;
    },
  };
  return {
    command: () => chain,
    getAction: () => registeredAction,
    getOptions: () => options,
  };
}

describe("wp logs command", () => {
  beforeEach(() => {
    stateRoot.path = mkdtempSync(join(tmpdir(), "wp-logs-command-"));
  });

  afterEach(() => {
    rmSync(stateRoot.path, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("prints the latest log by default and older logs by ordinal", async () => {
    const older = createCliLogSink("test");
    older.write("older\n");
    await older.finalize({ exitCode: 0, summary: "older" });

    const newer = createCliLogSink("test");
    newer.write("newer\n");
    await newer.finalize({ exitCode: 1, summary: "newer" });

    const cli = buildFakeCli();
    registerLogsCommand(cli as never);
    const action = cli.getAction();

    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    expect(action?.("test")).toBe(0);
    expect(writes.join("")).toContain("newer");

    writes.length = 0;
    expect(action?.("test", "2")).toBe(0);
    expect(writes.join("")).toContain("older");
  });

  it("rejects invalid ordinals and unknown commands and reports empty history", () => {
    const cli = buildFakeCli();
    registerLogsCommand(cli as never);
    const action = cli.getAction();
    const errors: string[] = [];
    const infos: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
      errors.push(String(message ?? ""));
    });
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      infos.push(String(message ?? ""));
    });

    expect(action?.("unknown")).toBe(1);
    expect(errors.join("\n")).toContain("Unknown logs command");

    errors.length = 0;
    expect(action?.("test", "11")).toBe(1);
    expect(errors.join("\n")).toContain("1..10");

    expect(action?.("test")).toBe(0);
    expect(infos.join("\n")).toContain("No logs yet for test");
  });
});
