import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));

export const SAMPLE_FIXTURE_PATH = resolve(testDir, "..", "__fixtures__", "sample-stream.jsonl");

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

export type CaptureCli = (
  args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type SchemaLine = {
  type: string;
  subtype: string | null;
  paths: string[];
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const pairs = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${pairs.join(",")}}`;
  }
  return JSON.stringify(value);
}

function collectSchemaPaths(value: JsonValue, prefix = ""): string[] {
  if (Array.isArray(value)) {
    const base = prefix ? `${prefix}[]` : "[]";
    const childPaths = value.flatMap((item) => collectSchemaPaths(item, base));
    return [base, ...childPaths];
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .flatMap((key) => collectSchemaPaths(value[key], prefix ? `${prefix}.${key}` : key));
    return prefix ? [prefix, ...entries] : entries;
  }

  const kind = value === null ? "null" : typeof value;
  return [`${prefix}:${kind}`];
}

function parseJsonLines(raw: string): JsonRecord[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return isRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

export function extractFixtureLines(raw: string): string {
  const records = parseJsonLines(raw).filter((record) => {
    const type = typeof record.type === "string" ? record.type : "";
    return type === "assistant" || type === "result";
  });

  return records.map((record) => stableStringify(record)).join("\n") + (records.length ? "\n" : "");
}

export function summarizeSchema(raw: string): SchemaLine[] {
  return parseJsonLines(raw).map((record) => ({
    type: typeof record.type === "string" ? record.type : "unknown",
    subtype: typeof record.subtype === "string" ? record.subtype : null,
    paths: Array.from(new Set(collectSchemaPaths(record).sort())),
  }));
}

export function diffFixtureSchema(committedRaw: string, freshRaw: string): string[] {
  const committed = summarizeSchema(committedRaw);
  const fresh = summarizeSchema(freshRaw);

  const diffs: string[] = [];
  if (committed.length !== fresh.length) {
    diffs.push(`line-count: committed=${committed.length} fresh=${fresh.length}`);
  }

  const max = Math.max(committed.length, fresh.length);
  for (let index = 0; index < max; index += 1) {
    const left = committed[index];
    const right = fresh[index];
    if (!left || !right) {
      continue;
    }

    if (left.type !== right.type || left.subtype !== right.subtype) {
      diffs.push(
        `line ${index + 1} type: committed=${left.type}/${left.subtype ?? "-"} fresh=${right.type}/${right.subtype ?? "-"}`,
      );
    }

    const leftPaths = left.paths.join("|");
    const rightPaths = right.paths.join("|");
    if (leftPaths !== rightPaths) {
      diffs.push(`line ${index + 1} paths differ`);
    }
  }

  return diffs;
}

async function captureViaClaude(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["claude", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode: await proc.exited, stdout, stderr };
}

export async function checkLiveFixture(
  options: {
    capture?: CaptureCli;
    committedRaw?: string;
  } = {},
): Promise<void> {
  const capture = options.capture ?? captureViaClaude;
  const committedRaw = options.committedRaw ?? readFileSync(SAMPLE_FIXTURE_PATH, "utf8");

  const result = await capture([
    "--print",
    "--verbose",
    "--output-format",
    "stream-json",
    "say hi",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to capture fresh fixture: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }

  const freshFixture = extractFixtureLines(result.stdout);
  const diffs = diffFixtureSchema(committedRaw, freshFixture);
  if (diffs.length > 0) {
    throw new Error(`CLI fixture schema drift detected\n${diffs.join("\n")}`);
  }
}

if (import.meta.main) {
  try {
    await checkLiveFixture();
    console.log("CLI fixture schema matches committed sample-stream.jsonl");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
