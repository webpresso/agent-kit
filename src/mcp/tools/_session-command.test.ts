import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NativeUnavailable = vi.hoisted(
  () =>
    class NativeSessionMemoryUnavailableError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "NativeSessionMemoryUnavailableError";
      }
    },
);

vi.mock("#session-memory/native-runtime.js", () => ({
  NativeSessionMemoryUnavailableError: NativeUnavailable,
  loadNativeSessionMemoryEngine: () => {
    throw new NativeUnavailable("native unavailable in unit test");
  },
}));

import {
  MAX_CAPTURE_BYTES,
  runSessionCommand,
  searchSessionCommandOutput,
  validateCommand,
} from "./_session-command.js";

let root: string;
let dbPath: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "wp-session-command-unit-")));
  writeFileSync(join(root, "package.json"), '{"name":"fixture"}');
  dbPath = join(root, ".wp", "session-memory.db");
  mkdirSync(dirname(dbPath), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("runSessionCommand TypeScript backend", () => {
  it("returns a success summary, exit code, and indexed command output", async () => {
    const result = await runSessionCommand({
      command: `${JSON.stringify(process.execPath)} -e "console.log('needle success output')"`,
      label: "success-label",
      cwd: root,
      projectRoot: root,
      timeoutMs: 5_000,
      dbPath,
    });

    expect(result).toMatchObject({
      label: "success-label",
      exitCode: 0,
      indexed: true,
      backend: "typescript",
      timedOut: false,
    });
    expect(result.summary).toContain("needle success output");

    const hits = searchSessionCommandOutput(dbPath, ["success-label"], "needle");
    expect(hits[0]).toMatchObject({ source: "success-label" });
    expect(hits[0]?.content).toContain("needle success output");
  });

  it("truncates captured output before indexing and reports capture metadata", async () => {
    const result = await runSessionCommand({
      command: `${JSON.stringify(process.execPath)} -e "process.stdout.write('x'.repeat(${MAX_CAPTURE_BYTES + 128}))"`,
      label: "truncated-label",
      cwd: root,
      projectRoot: root,
      timeoutMs: 10_000,
      dbPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(true);
    expect(result.outputBytes).toBeGreaterThan(MAX_CAPTURE_BYTES);
    expect(result.capturedBytes).toBe(MAX_CAPTURE_BYTES);
    expect(result.summary).toContain("[output truncated before indexing]");
  });

  it("times out and cleans up a long-running child process", async () => {
    const started = Date.now();

    const result = await runSessionCommand({
      command: `${JSON.stringify(process.execPath)} -e "setTimeout(function(){}, 5000)"`,
      label: "timeout-label",
      cwd: root,
      projectRoot: root,
      timeoutMs: 50,
      dbPath,
    });

    expect(Date.now() - started).toBeLessThan(2_500);
    expect(result).toMatchObject({ exitCode: 124, timedOut: true, indexed: false });
    expect(result.summary).toBe("command timed out with no captured output");
  });

  it("still rejects unsafe commands before spawning", () => {
    expect(() => validateCommand("echo ok; rm -rf /", root, root)).toThrow(
      /disallowed shell syntax/u,
    );
  });
});
