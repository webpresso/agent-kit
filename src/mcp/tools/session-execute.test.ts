import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import sessionExecuteTool from "./_session-execute.js";
import { measureToolResultBytes } from "./_session-gain.js";
import sessionSearchTool from "./session-search.js";
import { SessionMemoryStore } from "../../session-memory/store.js";

let tmpDir: string;
let previousIndexDb: string | undefined;
let previousClaudeProjectDir: string | undefined;
let previousNativePath: string | undefined;
let previousBuildFromSource: string | undefined;

function payload(result: Awaited<ReturnType<typeof sessionExecuteTool.handler>>) {
  return result.structuredContent as {
    passed: boolean;
    summary: string;
    exitCode: number;
    gain?: {
      rawBasisBytes: number;
      returnedToolResultBytes: number;
      gainBytes: number;
      approxTokensSaved: number;
      precision: string;
      rawBytesBasis: string;
    };
    details: {
      label: string;
      exitCode: number;
      outputBytes: number;
      indexed: boolean;
      summary: string;
      backend: "native" | "typescript";
      fallbackReason?: string;
      truncated?: boolean;
      capturedBytes?: number;
      maxCaptureBytes?: number;
      timedOut?: boolean;
      signal?: string;
      hits?: Array<{ content: string; source: string; rank: number; tier: string }>;
    };
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wp-session-execute-test-"));
  previousIndexDb = process.env.WP_SESSION_MEMORY_INDEX_DB;
  previousClaudeProjectDir = process.env.CLAUDE_PROJECT_DIR;
  previousNativePath = process.env.WP_NATIVE_SESSION_MEMORY_PATH;
  previousBuildFromSource = process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE;
  process.env.WP_SESSION_MEMORY_INDEX_DB = join(tmpDir, "index.sqlite");
  process.env.CLAUDE_PROJECT_DIR = tmpDir;
  process.env.WP_NATIVE_SESSION_MEMORY_PATH = join(tmpDir, "missing-native.node");
  delete process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE;
});

afterEach(() => {
  if (previousIndexDb === undefined) delete process.env.WP_SESSION_MEMORY_INDEX_DB;
  else process.env.WP_SESSION_MEMORY_INDEX_DB = previousIndexDb;
  if (previousClaudeProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = previousClaudeProjectDir;
  if (previousNativePath === undefined) delete process.env.WP_NATIVE_SESSION_MEMORY_PATH;
  else process.env.WP_NATIVE_SESSION_MEMORY_PATH = previousNativePath;
  if (previousBuildFromSource === undefined)
    delete process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE;
  else process.env.WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE = previousBuildFromSource;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("wp_session_execute", () => {
  it("executes, indexes output into the shared TypeScript store, and returns query hits", async () => {
    const result = await sessionExecuteTool.handler?.({
      command: 'printf "%s\\n" "indexed needle from command"',
      label: "label",
      query: "indexed needle",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);

    expect(data).toMatchObject({
      passed: true,
      exitCode: 0,
      details: {
        label: "label",
        exitCode: 0,
        indexed: true,
        hits: [{ content: expect.stringContaining("indexed needle from command") }],
      },
    });

    const search = await sessionSearchTool.handler?.({
      cwd: tmpDir,
      query: "indexed needle",
      sourceTypes: ["indexed_chunk"],
      limit: 1,
    });
    expect(data.details).toMatchObject({
      backend: "typescript",
      fallbackReason: expect.stringContaining("no prebuilt addon found"),
      truncated: false,
      capturedBytes: data.details.outputBytes,
      maxCaptureBytes: 1024 * 1024,
    });
    const store = new SessionMemoryStore(process.env.WP_SESSION_MEMORY_INDEX_DB!);
    expect(
      store.search({ query: "indexed needle", source: "label", limit: 1 })[0]?.metadata,
    ).toMatchObject({
      executionBackend: "typescript",
      fallbackReason: expect.stringContaining("no prebuilt addon found"),
      maxCaptureBytes: 1024 * 1024,
      truncated: false,
    });
    store.close();
    expect(JSON.stringify(search.structuredContent)).toContain("indexed needle from command");
  });

  it("surfaces fallback truncation metadata for oversized command output", async () => {
    const result = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('x'.repeat(1048580))"`,
      label: "fallback-truncated",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);

    expect(data.details).toMatchObject({
      backend: "typescript",
      outputBytes: 1_048_580,
      capturedBytes: 1_048_576,
      maxCaptureBytes: 1_048_576,
      truncated: true,
    });
    expect(data.details.summary).toContain("[output truncated before indexing]");
  });

  it("replaces prior fallback output for the same label", async () => {
    await sessionExecuteTool.handler?.({
      command: 'printf "%s\\n" "old repeated label output"',
      label: "repeat-label",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const result = await sessionExecuteTool.handler?.({
      command: 'printf "%s\\n" "new repeated label output"',
      label: "repeat-label",
      query: "repeated label output",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);
    const store = new SessionMemoryStore(process.env.WP_SESSION_MEMORY_INDEX_DB!);
    try {
      const newHits = store.search({ query: "new repeated", source: "repeat-label", limit: 5 });

      expect(data.details.backend).toBe("typescript");
      expect(store.stats()).toMatchObject({
        chunkCount: 2,
        sources: ["repeat-label", "wp_session_execute:repeat-label"],
      });
      expect(newHits.map((hit) => hit.text).join("\n")).not.toContain("old repeated label output");
      expect(newHits[0]?.text).toContain("new repeated label output");
    } finally {
      store.close();
    }
  });

  it("clears prior fallback output for the same label when replacement output is empty", async () => {
    await sessionExecuteTool.handler?.({
      command: 'printf "%s\\n" "stale quiet replacement output"',
      label: "quiet-repeat-label",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const result = await sessionExecuteTool.handler?.({
      command: "true",
      label: "quiet-repeat-label",
      query: "stale quiet replacement",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);
    const store = new SessionMemoryStore(process.env.WP_SESSION_MEMORY_INDEX_DB!);
    try {
      expect(data.details).toMatchObject({
        backend: "typescript",
        indexed: false,
        outputBytes: 0,
      });
      expect(
        store.search({ query: "stale quiet replacement", source: "quiet-repeat-label", limit: 5 }),
      ).toEqual([]);
      expect(store.stats()).toMatchObject({ chunkCount: 0, sources: [] });
    } finally {
      store.close();
    }
  });

  it("does not fallback when a configured native addon exists but fails to load", async () => {
    const invalidAddon = join(tmpDir, "invalid-native.node");
    writeFileSync(invalidAddon, "not a native addon");
    process.env.WP_NATIVE_SESSION_MEMORY_PATH = invalidAddon;

    const result = await sessionExecuteTool.handler?.({
      command: 'printf "%s\\n" "should not run"',
      label: "invalid-native",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);

    expect(data).toMatchObject({
      passed: false,
      exitCode: -1,
      details: {
        exitCode: -1,
        indexed: false,
        backend: "typescript",
      },
    });
    expect(data.summary).toContain("failed to load from");
    expect(data.details.fallbackReason).toBeUndefined();
  });

  it("uses 124 for fallback timeouts and 128+n for signal exits", async () => {
    const timeoutResult = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "setTimeout(() => {}, 10000)"`,
      label: "fallback-timeout",
      execute: true,
      timeoutMs: 20,
      cwd: tmpDir,
    });
    const signalResult = await sessionExecuteTool.handler?.({
      command: `exec ${JSON.stringify(process.execPath)} -e "process.kill(process.pid, 'SIGTERM')"`,
      label: "fallback-signal",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });

    expect(payload(timeoutResult).details).toMatchObject({
      backend: "typescript",
      exitCode: 124,
      timedOut: true,
    });
    expect(payload(signalResult).details).toMatchObject({
      backend: "typescript",
      exitCode: 143,
      signal: "SIGTERM",
    });
  });

  it("records exact command-output gain using total stdout/stderr bytes", async () => {
    const result = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('x'.repeat(12000))"`,
      label: "gain-large",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);

    expect(data.gain).toMatchObject({
      rawBasisBytes: 12000,
      precision: "exact_utf8_bytes_approx_tokens",
      rawBytesBasis: "command_output_total",
    });
    expect(data.gain?.gainBytes).toBeGreaterThan(0);
    expect(data.gain?.approxTokensSaved).toBe(Math.floor((data.gain?.gainBytes ?? 0) / 4));
  });

  it("includes stderr bytes, query hits, and telemetry overhead in persisted gain totals", async () => {
    const result = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('out-needle'); process.stderr.write('err-needle')"`,
      label: "gain-with-hits",
      query: "needle",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);

    expect(data.details).toMatchObject({
      outputBytes: 20,
      hits: [
        {
          content: expect.stringMatching(/^(out-needleerr-needle|err-needleout-needle)$/u),
          source: "gain-with-hits",
          rank: 1,
        },
      ],
    });
    expect(data.gain).toStrictEqual({
      rawBasisBytes: 20,
      returnedToolResultBytes: measureToolResultBytes(result),
      gainBytes: 0,
      approxTokensSaved: 0,
      precision: "exact_utf8_bytes_approx_tokens",
      rawBytesBasis: "command_output_total",
    });

    const store = new SessionMemoryStore(process.env.WP_SESSION_MEMORY_INDEX_DB!);
    expect(store.gainStats()).toMatchObject({
      eventCount: 1,
      rawBasisBytes: 20,
      returnedToolResultBytes: measureToolResultBytes(result),
      gainBytes: 0,
      approxTokensSaved: 0,
      byTool: [
        {
          toolName: "wp_session_execute",
          eventCount: 1,
          rawBasisBytes: 20,
          returnedToolResultBytes: measureToolResultBytes(result),
        },
      ],
    });
    store.close();
  });

  it("records a zero-gain event for tiny command output", async () => {
    const result = await sessionExecuteTool.handler?.({
      command: "printf x",
      label: "gain-tiny",
      execute: true,
      timeoutMs: 5_000,
      cwd: tmpDir,
    });
    const data = payload(result);

    expect(data.gain).toMatchObject({ rawBasisBytes: 1, gainBytes: 0 });
  });

  it("returns an error envelope when execution fails while preserving indexed output", async () => {
    const result = await sessionExecuteTool.handler?.({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('failure sentinel'); process.exit(42)"`,
      label: "failure-label",
      query: "failure sentinel",
      execute: true,
      cwd: tmpDir,
    });
    const data = payload(result);

    expect(result.isError).toBe(true);
    expect(data).toMatchObject({ passed: false, exitCode: 42 });
    expect(data.details.hits?.[0]?.content).toContain("failure sentinel");
  });

  it("rejects shell metacharacters and returns an error before spawning", async () => {
    const markerPath = join(tmpDir, "pwned-by-injection");
    const result = await sessionExecuteTool.handler?.({
      command: `printf "%s\n" "safe"; touch ${JSON.stringify(markerPath)}`,
      execute: true,
      cwd: tmpDir,
    });

    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ passed: false, exitCode: -1 });
    expect(existsSync(markerPath)).toBe(false);
  });

  it("rejects cwd outside the trusted project root", async () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), "wp-session-execute-outside-"));
    try {
      const result = await sessionExecuteTool.handler?.({
        command: "echo should-not-run",
        execute: true,
        cwd: outsideRoot,
      });

      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({ passed: false, exitCode: -1 });
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("requires explicit execute=true before running a shell command", async () => {
    const result = await sessionExecuteTool.handler?.({ command: "echo nope" });
    expect(payload(result)).toMatchObject({ passed: false, exitCode: -1 });
  });
});
