import { z } from "zod";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { ToolDescriptor } from "#mcp/auto-discover";
import { SessionMemoryStore } from "#session-memory/store.js";
import { createSummaryOutputSchema, createSummaryResult } from "./_shared/result.js";
import { WP_SESSION_RETRIEVE_TOOL_NAME } from "#mcp/_session-elision-schema.js";
import { defaultIndexDbPath } from "./session-restore.js";

const DEFAULT_MAX_BYTES = 4 * 1024;
const MAX_BYTES = 256 * 1024;
const ELISION_ID_RE = /^elision:[a-f0-9]{32}$/u;

const inputSchema = z
  .object({
    id: z.string().min(1).max(160),
    cwd: z.string().optional(),
    maxBytes: z.number().int().positive().max(MAX_BYTES).optional().default(DEFAULT_MAX_BYTES),
  })
  .strict();

const outputSchema = createSummaryOutputSchema({
  details: z.object({
    id: z.string(),
    source: z.string().optional(),
    text: z.string(),
    bytes: z.number(),
    truncated: z.boolean(),
    metadata: z.record(z.string(), z.unknown()),
    warnings: z.array(z.string()),
  }),
}).extend({
  id: z.string(),
  source: z.string().optional(),
  text: z.string(),
  bytes: z.number(),
  truncated: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
  warnings: z.array(z.string()),
});

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) return value;
  let bytes = 0;
  let output = "";
  for (const char of value) {
    const charBytes = utf8ByteLength(char);
    if (bytes + charBytes > maxBytes) break;
    output += char;
    bytes += charBytes;
  }
  return output;
}

const tool: ToolDescriptor = {
  name: WP_SESSION_RETRIEVE_TOOL_NAME,
  description:
    "Retrieve exact session-memory elided content by id. Use this when an elision handle is present; use search for content lookup and restore for broader continuity.",
  inputSchema,
  outputSchema,
  annotations: {
    title: "Session Retrieve",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = inputSchema.parse(raw ?? {});
    const warnings: string[] = [];
    if (!ELISION_ID_RE.test(input.id)) {
      warnings.push("malformed elision retrieval id");
      const payload = {
        passed: false,
        summary: "session chunk was not found",
        id: input.id,
        text: "",
        bytes: 0,
        truncated: false,
        metadata: {},
        warnings,
        details: {
          id: input.id,
          text: "",
          bytes: 0,
          truncated: false,
          metadata: {},
          warnings,
        },
      };
      return createSummaryResult(payload, { isError: true });
    }

    const dbPath = defaultIndexDbPath(input.cwd);
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = new SessionMemoryStore(dbPath);
    try {
      const chunk = store.getChunkById(input.id);
      if (!chunk) {
        const payload = {
          passed: false,
          summary: `session chunk ${input.id} was not found`,
          id: input.id,
          text: "",
          bytes: 0,
          truncated: false,
          metadata: {},
          warnings,
          details: {
            id: input.id,
            text: "",
            bytes: 0,
            truncated: false,
            metadata: {},
            warnings,
          },
        };
        return createSummaryResult(payload, { isError: true });
      }

      const text = truncateUtf8(chunk.text, input.maxBytes);
      const bytes = utf8ByteLength(text);
      const truncated = bytes < chunk.bytes;
      const payload = {
        passed: true,
        summary: truncated
          ? `retrieved ${bytes}/${chunk.bytes} bytes for ${input.id}`
          : `retrieved ${bytes} bytes for ${input.id}`,
        id: chunk.id,
        source: chunk.source,
        text,
        bytes,
        truncated,
        metadata: chunk.metadata,
        warnings,
        details: {
          id: chunk.id,
          source: chunk.source,
          text,
          bytes,
          truncated,
          metadata: chunk.metadata,
          warnings,
        },
      };
      return createSummaryResult(payload);
    } finally {
      store.close();
    }
  },
};

export default tool;
