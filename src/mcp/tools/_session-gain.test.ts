import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SessionMemoryStore } from "#session-memory/store.js";
import {
  createGainSummaryResult,
  measureToolResultBytes,
  utf8ByteLength,
} from "./_session-gain.js";

const dirs: string[] = [];

function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "wp-session-gain-test-"));
  dirs.push(dir);
  return join(dir, "index.sqlite");
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("session gain telemetry", () => {
  it("uses exact UTF-8 byte math and approximate byte/4 tokens", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("界")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);

    const path = dbPath();
    const result = createGainSummaryResult(
      { passed: true, summary: "emoji ok 😀" },
      {},
      {
        toolName: "wp_session_index",
        dbPath: path,
        rawBasisBytes: 1_000,
        rawBytesBasis: "index_accepted_text",
      },
    );
    const gain = result.structuredContent?.gain as {
      rawBasisBytes: number;
      returnedToolResultBytes: number;
      gainBytes: number;
      approxTokensSaved: number;
      precision: string;
      rawBytesBasis: string;
    };

    expect(gain).toStrictEqual({
      rawBasisBytes: 1_000,
      returnedToolResultBytes: measureToolResultBytes(result),
      gainBytes: 1_000 - measureToolResultBytes(result),
      approxTokensSaved: Math.floor((1_000 - measureToolResultBytes(result)) / 4),
      precision: "exact_utf8_bytes_approx_tokens",
      rawBytesBasis: "index_accepted_text",
    });
  });

  it("converges across returned-byte digit boundaries without extra measurement", () => {
    const measuredSizes = [9, 10, 10];
    const result = createGainSummaryResult(
      { passed: true, summary: "digit boundary" },
      {},
      {
        toolName: "wp_session_index",
        dbPath: dbPath(),
        rawBasisBytes: 100,
        rawBytesBasis: "index_accepted_text",
        measureResultBytes: () => measuredSizes.shift() ?? 10,
      },
    );

    expect(result.structuredContent?.gain).toStrictEqual({
      rawBasisBytes: 100,
      returnedToolResultBytes: 10,
      gainBytes: 90,
      approxTokensSaved: 22,
      precision: "exact_utf8_bytes_approx_tokens",
      rawBytesBasis: "index_accepted_text",
    });
    expect(measuredSizes).toEqual([]);
  });

  it("stores zero-gain events when telemetry overhead exceeds the raw basis", () => {
    const path = dbPath();
    const result = createGainSummaryResult(
      { passed: true, summary: "tiny" },
      {},
      {
        toolName: "wp_session_execute",
        dbPath: path,
        rawBasisBytes: 1,
        rawBytesBasis: "command_output_total",
      },
    );
    const gain = result.structuredContent?.gain;
    expect(gain).toMatchObject({
      rawBasisBytes: 1,
      gainBytes: 0,
      approxTokensSaved: 0,
      rawBytesBasis: "command_output_total",
    });

    const store = new SessionMemoryStore(path);
    expect(store.gainStats()).toMatchObject({
      eventCount: 1,
      rawBasisBytes: 1,
      gainBytes: 0,
      approxTokensSaved: 0,
      byTool: [{ toolName: "wp_session_execute", eventCount: 1, rawBasisBytes: 1 }],
    });
    store.close();
  });

  it("normalizes invalid and fractional raw byte inputs before reporting gain", () => {
    const fractional = createGainSummaryResult(
      { passed: true, summary: "fractional" },
      {},
      {
        toolName: "wp_session_index",
        dbPath: dbPath(),
        rawBasisBytes: 42.9,
        rawBytesBasis: "index_accepted_text",
      },
    );
    const invalid = createGainSummaryResult(
      { passed: true, summary: "invalid" },
      {},
      {
        toolName: "wp_session_index",
        dbPath: dbPath(),
        rawBasisBytes: Number.POSITIVE_INFINITY,
        rawBytesBasis: "index_accepted_text",
      },
    );

    expect(fractional.structuredContent?.gain).toMatchObject({ rawBasisBytes: 42 });
    expect(invalid.structuredContent?.gain).toMatchObject({
      rawBasisBytes: 0,
      gainBytes: 0,
      approxTokensSaved: 0,
    });
  });

  it("uses an injected gain recorder instead of opening a second store", () => {
    const missingParentDbPath = join(dbPath(), "missing-parent", "index.sqlite");
    const recorded: unknown[] = [];
    const result = createGainSummaryResult(
      { passed: true, summary: "callback" },
      {},
      {
        toolName: "wp_session_index",
        dbPath: missingParentDbPath,
        rawBasisBytes: 1_000,
        rawBytesBasis: "index_accepted_text",
        recordGainEvent: (gain) => recorded.push(gain),
      },
    );

    expect(recorded).toStrictEqual([result.structuredContent?.gain]);
    expect(existsSync(missingParentDbPath)).toBe(false);
  });

  it("omits gain and returns a warning if fixed-point sizing does not converge", () => {
    const path = dbPath();
    let measured = 0;
    const result = createGainSummaryResult(
      { passed: true, summary: "unstable", warnings: ["preexisting warning"] },
      {},
      {
        toolName: "wp_session_index",
        dbPath: path,
        rawBasisBytes: 100,
        rawBytesBasis: "index_accepted_text",
        measureResultBytes: () => {
          measured += 1;
          return measured;
        },
      },
    );

    expect(result.structuredContent?.gain).toBeUndefined();
    expect(measured).toBe(5);
    expect(result.structuredContent?.warnings).toEqual([
      "preexisting warning",
      "gain telemetry sizing did not converge after 5 iterations; omitted gain for this call",
    ]);
    const store = new SessionMemoryStore(path);
    expect(store.gainStats().eventCount).toBe(0);
    store.close();
  });
});
