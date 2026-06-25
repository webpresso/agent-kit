/**
 * Codex output-contract pinning (P5).
 *
 * Validates the deny envelope our pretool-guard emits against the CHECKED-IN golden Codex
 * schema (generated upstream via `codex app-server generate-json-schema`). This fails if
 * either our envelope drifts from the schema OR (when the golden is refreshed) the schema
 * drifts in a way our output no longer satisfies — catching contract drift without making
 * a live `codex` invocation a required CI gate.
 *
 * Also enforces the runtime rule the schema cannot express: Codex parses but FAILS-CLOSED
 * on continue/stopReason/suppressOutput and permissionDecision "ask", so our emitted
 * output must never contain them.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildDenyEnvelope } from "#hooks/shared/types.js";

type JsonSchema = {
  readonly type?: string;
  readonly additionalProperties?: boolean;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly string[];
  readonly const?: string;
  readonly $ref?: string;
  readonly allOf?: readonly JsonSchema[];
  readonly definitions?: Record<string, JsonSchema>;
};

const schemaDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "cli",
  "commands",
  "init",
  "scaffolders",
  "agent-hooks",
  "__fixtures__",
  "codex-schemas",
);

function loadSchema(name: string): JsonSchema {
  return JSON.parse(readFileSync(join(schemaDir, name), "utf8")) as JsonSchema;
}

const root = loadSchema("pre-tool-use.command.output.schema.json");

function resolveRef(schema: JsonSchema): JsonSchema {
  if (schema.$ref) {
    const key = schema.$ref.replace("#/definitions/", "");
    const resolved = root.definitions?.[key];
    if (!resolved) throw new Error(`unresolved $ref ${schema.$ref}`);
    return resolved;
  }
  if (schema.allOf && schema.allOf.length === 1) return resolveRef(schema.allOf[0]!);
  return schema;
}

/** Minimal structural validator: enforces additionalProperties:false, required, enum/const. */
function validate(value: unknown, schema: JsonSchema, path: string): string[] {
  const errors: string[] = [];
  const resolved = resolveRef(schema);
  if (resolved.type === "string" && value !== undefined && typeof value !== "string") {
    errors.push(`${path}: expected type string, got ${typeof value}`);
  }
  if (resolved.enum && !resolved.enum.includes(value as string)) {
    errors.push(`${path}: "${String(value)}" not in enum [${resolved.enum.join(", ")}]`);
  }
  if (resolved.const !== undefined && value !== resolved.const) {
    errors.push(`${path}: expected const "${resolved.const}", got "${String(value)}"`);
  }
  if (resolved.properties && value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const propSchema = resolved.properties[key];
      if (!propSchema) {
        if (resolved.additionalProperties === false) {
          errors.push(`${path}.${key}: not allowed by schema (additionalProperties:false)`);
        }
        continue;
      }
      errors.push(...validate(obj[key], propSchema, `${path}.${key}`));
    }
    for (const req of resolved.required ?? []) {
      if (!(req in obj)) errors.push(`${path}: missing required "${req}"`);
    }
  }
  return errors;
}

describe("codex output contract (golden schema)", () => {
  it("our deny envelope conforms to the golden pre-tool-use output schema", () => {
    const envelope = buildDenyEnvelope({ reason: "Use wp_pr_status MCP tool instead" });
    const errors = validate(envelope, root, "output");
    expect(errors, errors.join("\n")).toStrictEqual([]);
  });

  it("our deny envelope omits fields Codex fails-closed on", () => {
    const envelope = buildDenyEnvelope({ reason: "x" }) as Record<string, unknown>;
    for (const forbidden of ["continue", "stopReason", "suppressOutput"]) {
      expect(forbidden in envelope, `must not emit "${forbidden}"`).toBe(false);
    }
    expect(envelope.hookSpecificOutput).toMatchObject({ permissionDecision: "deny" });
  });

  it("the validator actually rejects drift (guards against a no-op check)", () => {
    const bogus = { hookSpecificOutput: { hookEventName: "PreToolUse", bogusField: 1 } };
    const errors = validate(bogus, root, "output");
    expect(errors.some((e) => e.includes("bogusField"))).toBe(true);
  });

  it("the validator rejects an unsupported permissionDecision value", () => {
    const bad = {
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "maybe" },
    };
    const errors = validate(bad, root, "output");
    expect(errors.some((e) => e.includes("not in enum"))).toBe(true);
  });

  it("the validator rejects a non-string where the schema requires a string type", () => {
    const bad = {
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecisionReason: 42 },
    };
    const errors = validate(bad, root, "output");
    expect(errors.some((e) => e.includes("expected type string"))).toBe(true);
  });
});
