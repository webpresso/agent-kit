import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SpawnSyncReturns } from "node:child_process";
import { SessionMemoryStore } from "#session-memory/store.js";

const spawnSync = vi.hoisted(() => vi.fn<() => SpawnSyncReturns<string>>());

vi.mock("node:child_process", () => ({
  spawnSync,
}));

import { runGain } from "./index.js";

const dirs: string[] = [];

function fixtureDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "wp-gain-cli-test-"));
  dirs.push(dir);
  return join(dir, "index.sqlite");
}

function spawnResult(overrides: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return {
    pid: 123,
    output: [],
    stdout: "",
    stderr: "",
    signal: null,
    status: 0,
    error: undefined,
    ...overrides,
  };
}

afterEach(() => {
  spawnSync.mockReset();
  vi.restoreAllMocks();
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("runGain", () => {
  it("prints Webpresso session gain and RTK JSON totals separately", () => {
    const indexDbPath = fixtureDb();
    const store = new SessionMemoryStore(indexDbPath);
    store.recordGainEvent({
      toolName: "wp_session_index",
      rawBasisBytes: 100,
      returnedToolResultBytes: 40,
      gainBytes: 60,
      approxTokensSaved: 15,
      precision: "exact_utf8_bytes_approx_tokens",
      rawBytesBasis: "index_accepted_text",
    });
    store.close();
    spawnSync.mockReturnValue(spawnResult({ stdout: '{"tokens_saved":25,"bytes_saved":100}' }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = runGain({ indexDbPath });

    expect(result).toStrictEqual(0);
    expect(spawnSync).toHaveBeenCalledWith("rtk", ["gain", "--format", "json"], {
      encoding: "utf8",
    });
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("Webpresso Session Gain");
    expect(logged).toContain("Exact UTF-8 gain bytes: 60");
    expect(logged).toContain("RTK Gain Totals");
    expect(logged).toContain("RTK reported tokens saved: 25");
  });

  it("prints install hint and returns 0 when rtk is not found (ENOENT)", () => {
    const indexDbPath = fixtureDb();
    const enoentError = Object.assign(new Error("spawn rtk ENOENT"), { code: "ENOENT" });
    spawnSync.mockReturnValue(spawnResult({ pid: undefined, status: null, error: enoentError }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = runGain({ indexDbPath });

    expect(result).toStrictEqual(0);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("wp setup --with rtk");
  });

  it("returns non-zero exit code when rtk exits with failure without merging totals", () => {
    const indexDbPath = fixtureDb();
    spawnSync.mockReturnValue(spawnResult({ status: 1, stderr: "rtk failed" }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = runGain({ indexDbPath });

    expect(result).toStrictEqual(1);
    const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("not merged with RTK");
  });
});
