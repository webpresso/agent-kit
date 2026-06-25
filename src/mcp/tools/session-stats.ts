import { z } from "zod";

import type { ToolDescriptor } from "#mcp/auto-discover";

import { SessionMemorySessionStore } from "#session-memory/session.js";
import { SessionMemoryStore } from "#session-memory/store.js";
import { createSummaryOutputSchema, createSummaryResult } from "./_shared/result.js";
import { defaultIndexDbPath, defaultSessionDbPath } from "./session-restore.js";

const inputSchema = z
  .object({
    cwd: z.string().optional(),
    sessionDbPath: z.string().optional(),
    indexDbPath: z.string().optional(),
  })
  .strict();

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    eventCount: z.number(),
    repoCount: z.number(),
    sessionCount: z.number(),
    snapshotCount: z.number(),
    chunkCount: z.number(),
    sourceCount: z.number(),
  }),
  details: z.object({
    sources: z.array(z.string()),
  }),
}).extend({
  sources: z.array(z.string()),
});

const tool: ToolDescriptor = {
  name: "wp_session_stats",
  description:
    "Report bounded local session-memory continuity and index counts. Use for read-only session-memory counts and source diagnostics; run `wp session stats` directly only if this tool is unavailable.",
  inputSchema,
  outputSchema,
  annotations: {
    title: "Session stats",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = inputSchema.parse(raw ?? {});
    const sessionStore = new SessionMemorySessionStore(
      input.sessionDbPath ?? defaultSessionDbPath(input.cwd),
    );
    const indexStore = new SessionMemoryStore(input.indexDbPath ?? defaultIndexDbPath(input.cwd));
    try {
      const sessionStats = sessionStore.stats();
      const indexStats = indexStore.stats();
      const payload = {
        passed: true,
        summary: `session stats found ${sessionStats.eventCount} event${sessionStats.eventCount === 1 ? "" : "s"} and ${indexStats.chunkCount} chunk${indexStats.chunkCount === 1 ? "" : "s"}`,
        counts: {
          ...sessionStats,
          chunkCount: indexStats.chunkCount,
          sourceCount: indexStats.sourceCount,
        },
        sources: indexStats.sources,
        details: { sources: indexStats.sources },
      };
      return createSummaryResult(payload);
    } finally {
      sessionStore.close();
      indexStore.close();
    }
  },
};

export default tool;
