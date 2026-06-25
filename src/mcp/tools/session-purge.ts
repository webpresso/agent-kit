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
    target: z.enum(["all", "continuity_events", "indexed_chunks"]).optional().default("all"),
    repoHash: z.string().min(1).max(128).optional(),
    sessionId: z.string().min(1).max(240).optional(),
    source: z.string().min(1).max(240).optional(),
    confirm: z.boolean().optional().default(false),
    allowGlobal: z.boolean().optional().default(false),
  })
  .strict();

const outputSchema = createSummaryOutputSchema({
  counts: z.object({
    matchedEventCount: z.number(),
    deletedEventCount: z.number(),
    matchedSnapshotCount: z.number(),
    deletedSnapshotCount: z.number(),
    matchedChunkCount: z.number(),
    deletedChunkCount: z.number(),
    warningCount: z.number(),
  }),
  details: z.object({
    dryRun: z.boolean(),
    warnings: z.array(z.string()),
  }),
}).extend({
  dryRun: z.boolean(),
  warnings: z.array(z.string()),
});

type PurgeInput = z.infer<typeof inputSchema>;

function hasScope(input: PurgeInput): boolean {
  return Boolean(input.repoHash || input.sessionId || input.source);
}

const tool: ToolDescriptor = {
  name: "wp_session_purge",
  description:
    "Dry-run or explicitly confirm scoped local session-memory purge operations. Use for an explicit session-memory reset (dry-run first; confirm deletion); prefer over raw rm of the store; run `wp session purge` directly only if this tool is unavailable.",
  inputSchema,
  outputSchema,
  annotations: {
    title: "Session purge",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = inputSchema.parse(raw ?? {});
    const warnings: string[] = [];
    if (input.confirm && !hasScope(input) && !input.allowGlobal) {
      warnings.push("global purge requires allowGlobal=true");
      const payload = {
        passed: false,
        summary: "session purge rejected unscoped confirmed purge",
        dryRun: true,
        warnings,
        counts: {
          matchedEventCount: 0,
          deletedEventCount: 0,
          matchedSnapshotCount: 0,
          deletedSnapshotCount: 0,
          matchedChunkCount: 0,
          deletedChunkCount: 0,
          warningCount: warnings.length,
        },
        details: { dryRun: true, warnings },
      };
      return createSummaryResult(payload, { isError: true });
    }

    const sessionStore = new SessionMemorySessionStore(
      input.sessionDbPath ?? defaultSessionDbPath(input.cwd),
    );
    const indexStore = new SessionMemoryStore(input.indexDbPath ?? defaultIndexDbPath(input.cwd));
    try {
      const sessionResult =
        input.target === "indexed_chunks"
          ? {
              dryRun: input.confirm !== true,
              matchedEventCount: 0,
              deletedEventCount: 0,
              matchedSnapshotCount: 0,
              deletedSnapshotCount: 0,
              warnings: [] as string[],
            }
          : sessionStore.purge({
              repoHash: input.repoHash,
              sessionId: input.sessionId,
              confirm: input.confirm,
              allowGlobal: input.allowGlobal,
            });
      const shouldPurgeIndex =
        input.target !== "continuity_events" &&
        (Boolean(input.source) || input.allowGlobal || (!input.repoHash && !input.sessionId));
      const indexResult = shouldPurgeIndex
        ? indexStore.purge({
            source: input.source,
            confirm: input.confirm,
            allowGlobal: input.allowGlobal,
          })
        : {
            dryRun: input.confirm !== true,
            matchedCount: 0,
            deletedCount: 0,
            warnings: [] as string[],
          };
      warnings.push(...sessionResult.warnings, ...indexResult.warnings);
      const dryRun = sessionResult.dryRun && indexResult.dryRun;
      const deletedTotal =
        sessionResult.deletedEventCount +
        sessionResult.deletedSnapshotCount +
        indexResult.deletedCount;
      const matchedTotal =
        sessionResult.matchedEventCount +
        sessionResult.matchedSnapshotCount +
        indexResult.matchedCount;
      const passed =
        warnings.length === 0 && (input.confirm ? deletedTotal > 0 : matchedTotal >= 0);
      const payload = {
        passed,
        summary: input.confirm
          ? `session purge deleted ${deletedTotal} record${deletedTotal === 1 ? "" : "s"}`
          : `session purge dry-run matched ${matchedTotal} record${matchedTotal === 1 ? "" : "s"}`,
        dryRun,
        warnings,
        counts: {
          matchedEventCount: sessionResult.matchedEventCount,
          deletedEventCount: sessionResult.deletedEventCount,
          matchedSnapshotCount: sessionResult.matchedSnapshotCount,
          deletedSnapshotCount: sessionResult.deletedSnapshotCount,
          matchedChunkCount: indexResult.matchedCount,
          deletedChunkCount: indexResult.deletedCount,
          warningCount: warnings.length,
        },
        details: { dryRun, warnings },
      };
      return createSummaryResult(payload, passed ? {} : { isError: true });
    } finally {
      sessionStore.close();
      indexStore.close();
    }
  },
};

export default tool;
