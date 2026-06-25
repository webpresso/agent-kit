import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

type JsonRecord = Record<string, unknown>;

export type RecordedEvent = {
  event_id: string;
  scenario_id: string;
  turn_idx: number;
  recorded_at_ms: number | null;
  event: JsonRecord;
};

type StreamInput = string | ReadableStream<string | Uint8Array>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

async function readStream(input: StreamInput): Promise<string> {
  if (typeof input === "string") {
    return input;
  }

  const reader = input.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    output += typeof value === "string" ? value : decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

function parseJsonLine(line: string): JsonRecord | null {
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

export function deriveEventId(scenarioId: string, turnIdx: number, event: JsonRecord): string {
  return createHash("sha256")
    .update(`${scenarioId}:${turnIdx}:${stableStringify(event)}`)
    .digest("hex");
}

export async function recordStream(
  stream: StreamInput,
  outPath: string,
  scenarioId: string,
): Promise<RecordedEvent[]> {
  const content = await readStream(stream);
  const recorded: RecordedEvent[] = [];

  for (const line of content.split("\n")) {
    const event = parseJsonLine(line);
    if (!event) {
      continue;
    }

    const turnIdx = recorded.length;
    recorded.push({
      event_id: deriveEventId(scenarioId, turnIdx, event),
      scenario_id: scenarioId,
      turn_idx: turnIdx,
      recorded_at_ms: typeof event.timestamp === "number" ? event.timestamp : null,
      event,
    });
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const output = recorded.map((entry) => JSON.stringify(entry)).join("\n");
  await writeFile(outPath, output ? `${output}\n` : "", "utf8");

  return recorded;
}
