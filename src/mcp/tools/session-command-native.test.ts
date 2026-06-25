import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const executeSandboxedMock = vi.hoisted(() => vi.fn());

vi.mock("#session-memory/native-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#session-memory/native-runtime.js")>()),
  loadNativeSessionMemoryEngine: () => ({
    executeSandboxed: executeSandboxedMock,
  }),
}));

import { SessionMemoryStore } from "#session-memory/store.js";
import { runSessionCommand } from "./_session-command.js";

const roots: string[] = [];

afterEach(() => {
  executeSandboxedMock.mockReset();
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wp-session-command-native-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), '{"name":"fixture"}');
  const dbPath = join(root, ".wp", "session-memory.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  return { root, dbPath };
}

describe("runSessionCommand native backend elisions", () => {
  it("redacts native-indexed command output before returning an elision handle", async () => {
    const { root, dbPath } = fixture();
    const secret = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const rawOutput = `GITHUB_TOKEN=${secret}`;

    executeSandboxedMock.mockImplementation(
      async (path: string, _command: string, label: string) => {
        const store = new SessionMemoryStore(path);
        try {
          store.indexChunk({
            id: `native-command:${label}:1`,
            source: label,
            text: rawOutput,
            metadata: { executionBackend: "native" },
          });
        } finally {
          store.close();
        }
        return {
          exitCode: 0,
          outputBytes: Buffer.byteLength(rawOutput),
          indexed: true,
          summary: rawOutput,
          truncated: false,
          capturedBytes: Buffer.byteLength(rawOutput),
          maxCaptureBytes: 1024 * 1024,
          timedOut: false,
        };
      },
    );

    const result = await runSessionCommand({
      command: "printf native",
      label: "native-secret-output",
      cwd: root,
      projectRoot: root,
      timeoutMs: 5_000,
      dbPath,
    });

    expect(result.backend).toBe("native");
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.summary).toContain("GITHUB_TOKEN=gh***90");
    expect(result.warnings).toContain("command output was redacted before indexing");
    expect(result.elisions).toHaveLength(1);

    const store = new SessionMemoryStore(dbPath);
    try {
      const indexed = store.getChunksBySource("native-secret-output");
      expect(indexed.map((chunk) => chunk.text).join("")).toContain("GITHUB_TOKEN=gh***90");
      expect(indexed.map((chunk) => chunk.text).join("")).not.toContain(secret);
      const elision = result.elisions?.[0];
      const retrieved = elision ? store.getChunkById(elision.id) : undefined;
      expect(retrieved?.text).toContain("GITHUB_TOKEN=gh***90");
      expect(retrieved?.text).not.toContain(secret);
    } finally {
      store.close();
    }
  });
});
