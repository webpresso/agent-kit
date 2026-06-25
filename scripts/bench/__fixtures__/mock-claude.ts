import type { VariantSpawn } from "../lib/variant-runner";

type MockOptions = {
  defaultSeed?: number;
};

type JsonRecord = Record<string, unknown>;

function parseSeed(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hashText(text: string): number {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function buildStream(seed: number, prompt: string): string {
  const promptHash = hashText(prompt);
  const baseTimestamp = 1_700_000_000_000 + seed * 100 + (promptHash % 17);
  const inputTokens = 20 + (seed % 7);
  const outputTokens = 5 + (promptHash % 5);
  const cacheWriteTokens = seed % 3;
  const cacheReadTokens = (seed + promptHash) % 4;
  const durationMs = 40 + (seed % 11);
  const answer = `seed:${seed}:${prompt}`;

  const assistant: JsonRecord = {
    type: "assistant",
    timestamp: baseTimestamp,
    message: {
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheWriteTokens,
        cache_read_input_tokens: cacheReadTokens,
      },
      content: [
        { type: "tool_use", name: "wp_session_search", input: { query: `seed-${seed}` } },
        { type: "text", text: answer },
      ],
    },
  };

  const result: JsonRecord = {
    type: "result",
    timestamp: baseTimestamp + durationMs,
    duration_ms: durationMs,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheWriteTokens,
      cache_read_input_tokens: cacheReadTokens,
    },
  };

  return [assistant, result].map((entry) => JSON.stringify(entry)).join("\n");
}

export function createMockClaudeSpawn(options: MockOptions = {}): VariantSpawn {
  const defaultSeed = options.defaultSeed ?? 42;

  return async (cmd, spawnOptions) => {
    const prompt = cmd.at(-1) ?? "";
    const seed = parseSeed(spawnOptions.env.BENCH_SEED, defaultSeed);

    return {
      exitCode: 0,
      stdout: buildStream(seed, prompt),
      stderr: "",
    };
  };
}
