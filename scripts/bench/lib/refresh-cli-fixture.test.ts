import { describe, expect, it } from "vitest";

import {
  checkLiveFixture,
  diffFixtureSchema,
  extractFixtureLines,
  summarizeSchema,
} from "../__tests__/refresh-cli-fixture";

describe("refresh-cli-fixture gate", () => {
  it("extracts assistant/result lines from raw CLI output and ignores noisy system lines", () => {
    const raw = [
      JSON.stringify({ type: "system", subtype: "hook_started" }),
      JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1 } } }),
      JSON.stringify({ type: "result", usage: { input_tokens: 2 }, duration_ms: 9 }),
    ].join("\n");

    const fixture = extractFixtureLines(raw);
    const lines = fixture.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ type: "assistant" });
    expect(JSON.parse(lines[1] ?? "{}")).toMatchObject({ type: "result" });
  });

  it("treats same schema with different values as compatible", () => {
    const committed = [
      JSON.stringify({
        type: "assistant",
        message: { usage: { input_tokens: 0, output_tokens: 0 } },
      }),
      JSON.stringify({
        type: "result",
        duration_ms: 1,
        usage: { input_tokens: 2, output_tokens: 3 },
      }),
    ].join("\n");
    const fresh = [
      JSON.stringify({
        type: "assistant",
        message: { usage: { input_tokens: 99, output_tokens: 88 } },
      }),
      JSON.stringify({
        type: "result",
        duration_ms: 777,
        usage: { input_tokens: 4, output_tokens: 5 },
      }),
    ].join("\n");

    expect(diffFixtureSchema(committed, fresh)).toStrictEqual([]);
  });

  it("flags schema drift when expected token paths move or rename", () => {
    const committed = JSON.stringify({
      type: "result",
      duration_ms: 1,
      usage: { input_tokens: 2, cache_read_input_tokens: 3 },
    });
    const fresh = JSON.stringify({
      type: "result",
      duration_ms: 1,
      modelUsage: { input_tokens: 2, cacheReadInputTokens: 3 },
    });

    expect(diffFixtureSchema(committed, fresh)).toContain("line 1 paths differ");
  });

  it("checkLiveFixture throws on schema drift from a captured live fixture", async () => {
    await expect(
      checkLiveFixture({
        committedRaw: JSON.stringify({
          type: "result",
          duration_ms: 1,
          usage: { input_tokens: 2, output_tokens: 3 },
        }),
        capture: async () => ({
          exitCode: 0,
          stdout: [
            JSON.stringify({ type: "system", subtype: "hook_started" }),
            JSON.stringify({
              type: "result",
              duration_ms: 1,
              modelUsage: { input_tokens: 2, output_tokens: 3 },
            }),
          ].join("\n"),
          stderr: "",
        }),
      }),
    ).rejects.toThrow("CLI fixture schema drift detected");
  });

  it("summarizes schema deterministically", () => {
    const summary = summarizeSchema(
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "hi" }] },
      }),
    );

    expect(summary).toStrictEqual([
      {
        type: "assistant",
        subtype: null,
        paths: [
          "message",
          "message.content[]",
          "message.content[].text:string",
          "message.content[].type:string",
          "type:string",
        ],
      },
    ]);
  });
});
