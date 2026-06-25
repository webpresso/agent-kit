import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMockClaudeSpawn } from "../__fixtures__/mock-claude";
import { runCell } from "../lib/variant-runner";

type DiffResult = {
  firstLine: number | null;
  message: string;
};

function diffLines(left: string, right: string): DiffResult {
  const leftLines = left.trimEnd().split("\n");
  const rightLines = right.trimEnd().split("\n");
  const max = Math.max(leftLines.length, rightLines.length);

  for (let index = 0; index < max; index += 1) {
    if ((leftLines[index] ?? "") !== (rightLines[index] ?? "")) {
      return {
        firstLine: index + 1,
        message: `first diverging line ${index + 1}\nleft: ${leftLines[index] ?? "<missing>"}\nright: ${rightLines[index] ?? "<missing>"}`,
      };
    }
  }

  return { firstLine: null, message: "no diff" };
}

describe("bench reproducibility", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bench-repro-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("two runs with the same seed produce byte-identical transcripts", async () => {
    const spawn = createMockClaudeSpawn();

    const first = await runCell({
      scenario: "repro-scenario",
      prompt: "say hi",
      variant: "v1",
      trial: 1,
      pluginDir: "/tmp/plugin-v1",
      outputRoot: dir,
      runId: "run-a",
      spawn,
      apiKeys: { ANTHROPIC_API_KEY_V1: "test-key" },
    });

    const second = await runCell({
      scenario: "repro-scenario",
      prompt: "say hi",
      variant: "v1",
      trial: 1,
      pluginDir: "/tmp/plugin-v1",
      outputRoot: dir,
      runId: "run-b",
      spawn,
      apiKeys: { ANTHROPIC_API_KEY_V1: "test-key" },
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const firstText = readFileSync(first.ok ? first.transcript_path : "", "utf8");
    const secondText = readFileSync(second.ok ? second.transcript_path : "", "utf8");
    const diff = diffLines(firstText, secondText);

    expect(diff.message).toBe("no diff");
    expect(firstText).toBe(secondText);
  });

  it("two runs with different seeds produce different transcripts", async () => {
    const spawn = createMockClaudeSpawn();
    const originalSeed = process.env.BENCH_SEED;

    try {
      process.env.BENCH_SEED = "42";
      const first = await runCell({
        scenario: "repro-scenario",
        prompt: "say hi",
        variant: "v1",
        trial: 1,
        pluginDir: "/tmp/plugin-v1",
        outputRoot: dir,
        runId: "seed-42",
        spawn,
        apiKeys: { ANTHROPIC_API_KEY_V1: "test-key" },
      });

      process.env.BENCH_SEED = "43";
      const second = await runCell({
        scenario: "repro-scenario",
        prompt: "say hi",
        variant: "v1",
        trial: 1,
        pluginDir: "/tmp/plugin-v1",
        outputRoot: dir,
        runId: "seed-43",
        spawn,
        apiKeys: { ANTHROPIC_API_KEY_V1: "test-key" },
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      const firstText = readFileSync(first.ok ? first.transcript_path : "", "utf8");
      const secondText = readFileSync(second.ok ? second.transcript_path : "", "utf8");
      const diff = diffLines(firstText, secondText);

      expect(diff.firstLine).not.toBeNull();
      expect(firstText).not.toBe(secondText);
    } finally {
      if (originalSeed === undefined) {
        delete process.env.BENCH_SEED;
      } else {
        process.env.BENCH_SEED = originalSeed;
      }
    }
  });
});
