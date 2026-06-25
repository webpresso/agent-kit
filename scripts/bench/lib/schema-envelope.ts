type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonRecord = Record<string, JsonValue>;

export type StructuralEnvelope = readonly string[];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueKind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function visit(value: unknown, path: string, out: string[]): void {
  out.push(`${path}:${valueKind(value)}`);

  if (Array.isArray(value)) {
    const firstRecord = value.find((item) => isRecord(item));
    if (firstRecord) {
      visit(firstRecord, `${path}[]`, out);
      return;
    }
    const firstValue = value.find((item) => item !== undefined);
    if (firstValue !== undefined) visit(firstValue, `${path}[]`, out);
    return;
  }

  if (!isRecord(value)) return;

  for (const key of Object.keys(value)) {
    visit(value[key], `${path}.${key}`, out);
  }
}

export function structuralEnvelope(value: unknown): StructuralEnvelope {
  const out: string[] = [];
  visit(value, "$", out);
  return [...new Set(out)].sort();
}

export function diffStructuralEnvelope(expected: unknown, actual: unknown): string[] {
  const expectedEnvelope = new Set(structuralEnvelope(expected));
  const actualEnvelope = new Set(structuralEnvelope(actual));
  const missing = [...expectedEnvelope]
    .filter((entry) => !actualEnvelope.has(entry))
    .map((entry) => `missing ${entry}`);
  const added = [...actualEnvelope]
    .filter((entry) => !expectedEnvelope.has(entry))
    .map((entry) => `added ${entry}`);
  return [...missing, ...added].sort();
}
