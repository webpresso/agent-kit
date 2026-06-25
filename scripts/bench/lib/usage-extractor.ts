export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  duration_ms: number;
};

type JsonRecord = Record<string, unknown>;

const ZERO_USAGE: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  duration_ms: 0,
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function readNumber(record: JsonRecord, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseLine(line: string): JsonRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readUsageFromRecord(record: JsonRecord): Usage | null {
  const usage = isRecord(record.usage) ? record.usage : null;
  if (usage) {
    return {
      input_tokens: readNumber(usage, "input_tokens"),
      output_tokens: readNumber(usage, "output_tokens"),
      cache_creation_input_tokens: readNumber(usage, "cache_creation_input_tokens"),
      cache_read_input_tokens: readNumber(usage, "cache_read_input_tokens"),
      duration_ms: readNumber(record, "duration_ms"),
    };
  }

  const message = isRecord(record.message) ? record.message : null;
  const messageUsage = message && isRecord(message.usage) ? message.usage : null;
  if (messageUsage) {
    return {
      input_tokens: readNumber(messageUsage, "input_tokens"),
      output_tokens: readNumber(messageUsage, "output_tokens"),
      cache_creation_input_tokens: readNumber(messageUsage, "cache_creation_input_tokens"),
      cache_read_input_tokens: readNumber(messageUsage, "cache_read_input_tokens"),
      duration_ms: readNumber(record, "duration_ms"),
    };
  }

  const part = isRecord(record.part) ? record.part : null;
  const tokens = part && isRecord(part.tokens) ? part.tokens : null;
  if (tokens) {
    const cache = isRecord(tokens.cache) ? tokens.cache : null;
    return {
      input_tokens: readNumber(tokens, "input"),
      output_tokens: readNumber(tokens, "output"),
      cache_creation_input_tokens: cache ? readNumber(cache, "write") : 0,
      cache_read_input_tokens: cache ? readNumber(cache, "read") : 0,
      duration_ms: readNumber(record, "duration_ms"),
    };
  }

  return null;
}

function collectToolUses(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolUses(item, out);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (value.type === "tool_use" && typeof value.name === "string") {
    out.push(value.name);
  }

  collectToolUses(value.content, out);
  collectToolUses(value.message, out);
  collectToolUses(value.part, out);
}

export function extractUsage(streamJsonl: string): Usage {
  let best = ZERO_USAGE;

  for (const line of streamJsonl.split("\n")) {
    const record = parseLine(line);
    if (!record) {
      continue;
    }

    const usage = readUsageFromRecord(record);
    if (!usage) {
      continue;
    }

    const hasBetterDuration = usage.duration_ms > 0 || best.duration_ms === 0;
    best = {
      input_tokens: usage.input_tokens || best.input_tokens,
      output_tokens: usage.output_tokens || best.output_tokens,
      cache_creation_input_tokens:
        usage.cache_creation_input_tokens || best.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens || best.cache_read_input_tokens,
      duration_ms: hasBetterDuration ? usage.duration_ms : best.duration_ms,
    };

    if (record.type === "result") {
      best = usage;
    }
  }

  return best;
}

export function extractToolUses(streamJsonl: string): string[] {
  const tools: string[] = [];

  for (const line of streamJsonl.split("\n")) {
    const record = parseLine(line);
    if (!record) {
      continue;
    }

    collectToolUses(record, tools);
  }

  return [...new Set(tools)];
}
