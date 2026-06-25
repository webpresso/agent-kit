import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deriveEventId, recordStream } from "./transcript-recorder";

function toStream(text: string): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

describe("transcript-recorder", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bench-transcript-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("recordStream writes one replayable JSONL line per event with deterministic sha256 event IDs", async () => {
    const outPath = join(dir, "run-a", "transcript.jsonl");
    const source = [
      JSON.stringify({
        type: "assistant",
        timestamp: 1000,
        message: { content: [{ type: "text", text: "hi" }] },
      }),
      JSON.stringify({
        type: "result",
        timestamp: 1005,
        duration_ms: 5,
        usage: {
          input_tokens: 10,
          output_tokens: 2,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      }),
    ].join("\n");

    const recorded = await recordStream(toStream(source), outPath, "scenario-debug");
    const lines = readFileSync(outPath, "utf8").trim().split("\n");
    const parsed = lines.map((line) => JSON.parse(line) as Awaited<typeof recorded>[number]);

    expect(recorded).toHaveLength(2);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.event_id).toBe(
      deriveEventId("scenario-debug", 0, {
        type: "assistant",
        timestamp: 1000,
        message: { content: [{ type: "text", text: "hi" }] },
      }),
    );
    expect(parsed[0]?.event_id).toHaveLength(64);
    expect(parsed[1]?.recorded_at_ms).toBe(1005);
    expect(parsed[1]?.event).toMatchObject({ type: "result", duration_ms: 5 });
  });

  it("re-running with the same input produces byte-identical output", async () => {
    const source = [
      "not-json",
      JSON.stringify({ type: "system", timestamp: 1, subtype: "init" }),
      JSON.stringify({
        type: "assistant",
        timestamp: 2,
        message: { content: [{ type: "text", text: "ok" }] },
      }),
    ].join("\n");

    const outA = join(dir, "run-a", "transcript.jsonl");
    const outB = join(dir, "run-b", "transcript.jsonl");

    await recordStream(source, outA, "scenario-replay");
    await recordStream(source, outB, "scenario-replay");

    expect(readFileSync(outA, "utf8")).toBe(readFileSync(outB, "utf8"));
  });
});
