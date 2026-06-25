import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import type { ToolDescriptor } from "#mcp/auto-discover";
import { getSurfacePath, NotInGitRepoError } from "#paths/state-root.js";
import { resolveSessionRepoHash } from "#session-memory/repo-hash.js";

import { SessionMemorySessionStore } from "#session-memory/session.js";
import { SessionMemoryStore } from "#session-memory/store.js";
import type {
  SessionMemoryUnifiedResult,
  SessionMemoryUnifiedSourceType,
} from "#session-memory/types.js";
import { createSummaryOutputSchema, createSummaryResult } from "./_shared/result.js";

const MAX_LIMIT = 50;
const DEFAULT_RESTORE_LIMIT = 5;
const MAX_PREVIEW_BYTES = 4 * 1024;
const MAX_SOURCE_LENGTH = 240;

const sourceTypeSchema = z.enum(["continuity_event", "indexed_chunk"]);

export const sessionRecallInputSchema = z
  .object({
    cwd: z.string().optional(),
    sessionDbPath: z.string().optional(),
    indexDbPath: z.string().optional(),
    repoHash: z.string().min(1).max(128).optional(),
    query: z.string().max(4_096).default(""),
    source: z.string().min(1).max(MAX_SOURCE_LENGTH).optional(),
    sourceTypes: z.array(sourceTypeSchema).max(2).optional(),
    limit: z.number().int().optional(),
    maxPreviewBytes: z.number().int().positive().max(MAX_PREVIEW_BYTES).optional().default(1024),
  })
  .strict();

export type SessionRecallInput = z.infer<typeof sessionRecallInputSchema>;

const unifiedProvenanceSchema = z.object({
  kind: sourceTypeSchema,
  id: z.string(),
  source: z.string().optional(),
  repoHash: z.string().optional(),
  sessionId: z.string().optional(),
  eventId: z.string().optional(),
});

const unifiedResultSchema = z.object({
  sourceType: sourceTypeSchema,
  provenance: unifiedProvenanceSchema,
  dedupeKey: z.string(),
  score: z.number(),
  tier: z.string(),
  timestamp: z.string(),
  preview: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export const sessionRecallOutputSchema = createSummaryOutputSchema({
  counts: z.object({
    resultCount: z.number(),
    continuityEventCount: z.number(),
    indexedChunkCount: z.number(),
    warningCount: z.number(),
  }),
  details: z.object({
    results: z.array(unifiedResultSchema),
    warnings: z.array(z.string()),
  }),
}).extend({
  results: z.array(unifiedResultSchema),
  warnings: z.array(z.string()),
});

export interface SessionRecallPayload {
  readonly [key: string]: unknown;
  readonly passed: boolean;
  readonly summary: string;
  readonly counts: {
    readonly resultCount: number;
    readonly continuityEventCount: number;
    readonly indexedChunkCount: number;
    readonly warningCount: number;
  };
  readonly results: readonly SessionMemoryUnifiedResult[];
  readonly warnings: readonly string[];
  readonly details: {
    readonly results: readonly SessionMemoryUnifiedResult[];
    readonly warnings: readonly string[];
  };
}

type RecallMode = "restore" | "search";

export interface BuildRecallPayloadInput {
  readonly input: SessionRecallInput;
  readonly mode: RecallMode;
  readonly sourcePriority: readonly SessionMemoryUnifiedSourceType[];
}

function effectiveCwd(cwd?: string): string {
  return cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

function isNotInGitRepoError(error: unknown): boolean {
  return (
    error instanceof NotInGitRepoError || (error as Error | undefined)?.name === "NotInGitRepoError"
  );
}

export function defaultSessionDbPath(cwd?: string): string {
  if (process.env.WP_SESSION_MEMORY_DB) return process.env.WP_SESSION_MEMORY_DB;
  if (process.env.WP_SESSION_MEMORY_DIR)
    return join(process.env.WP_SESSION_MEMORY_DIR, "sessions.sqlite");
  const startDir = effectiveCwd(cwd);
  try {
    return getSurfacePath("session-memory/sessions.sqlite", "worktree", startDir);
  } catch (error) {
    if (isNotInGitRepoError(error)) {
      return join(
        tmpdir(),
        "webpresso-session-memory",
        resolveSessionRepoHash(startDir),
        "sessions.sqlite",
      );
    }
    throw error;
  }
}

export function defaultIndexDbPath(cwd?: string): string {
  if (process.env.WP_SESSION_MEMORY_INDEX_DB) return process.env.WP_SESSION_MEMORY_INDEX_DB;
  const startDir = effectiveCwd(cwd);
  try {
    return getSurfacePath("session-memory/index.sqlite", "worktree", startDir);
  } catch (error) {
    if (isNotInGitRepoError(error)) {
      return join(
        tmpdir(),
        "webpresso-session-memory",
        resolveSessionRepoHash(startDir),
        "index.sqlite",
      );
    }
    throw error;
  }
}

function resolveRepoHash(input: SessionRecallInput): string {
  return input.repoHash ?? resolveSessionRepoHash(effectiveCwd(input.cwd));
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.trunc(value), MAX_LIMIT);
}

function requestedSourceTypes(
  input: SessionRecallInput,
  fallback: readonly SessionMemoryUnifiedSourceType[],
): readonly SessionMemoryUnifiedSourceType[] {
  if (!input.sourceTypes || input.sourceTypes.length === 0) return fallback;
  return [...new Set(input.sourceTypes)];
}

function mergeByPriority(
  groups: ReadonlyMap<SessionMemoryUnifiedSourceType, readonly SessionMemoryUnifiedResult[]>,
  sourcePriority: readonly SessionMemoryUnifiedSourceType[],
  limit: number,
): SessionMemoryUnifiedResult[] {
  const seen = new Set<string>();
  const merged: SessionMemoryUnifiedResult[] = [];
  for (const sourceType of sourcePriority) {
    for (const result of groups.get(sourceType) ?? []) {
      if (seen.has(result.dedupeKey)) continue;
      seen.add(result.dedupeKey);
      merged.push(result);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

export function buildRecallPayload(
  rawInput: SessionRecallInput,
  mode: RecallMode,
): SessionRecallPayload {
  const limit = normalizeLimit(rawInput.limit, mode === "restore" ? DEFAULT_RESTORE_LIMIT : 10);
  const sourceTypes = requestedSourceTypes(
    rawInput,
    mode === "restore" ? ["continuity_event"] : ["indexed_chunk", "continuity_event"],
  );
  const warnings: string[] = [];
  const groups = new Map<SessionMemoryUnifiedSourceType, SessionMemoryUnifiedResult[]>();
  const repoHash = resolveRepoHash(rawInput);

  if (sourceTypes.includes("continuity_event")) {
    const sessionStore = new SessionMemorySessionStore(
      rawInput.sessionDbPath ?? defaultSessionDbPath(rawInput.cwd),
    );
    try {
      groups.set(
        "continuity_event",
        sessionStore.restoreUnified({
          repoHash,
          query: rawInput.query,
          limit: Math.max(limit * 2, limit),
          maxPreviewBytes: rawInput.maxPreviewBytes,
          sourceTypes: ["continuity_event"],
        }),
      );
    } finally {
      sessionStore.close();
    }
  }

  if (sourceTypes.includes("indexed_chunk")) {
    const indexStore = new SessionMemoryStore(
      rawInput.indexDbPath ?? defaultIndexDbPath(rawInput.cwd),
    );
    try {
      groups.set(
        "indexed_chunk",
        indexStore.searchUnified({
          query: rawInput.query,
          source: rawInput.source,
          limit: Math.max(limit * 2, limit),
          maxPreviewBytes: rawInput.maxPreviewBytes,
          sourceTypes: ["indexed_chunk"],
        }),
      );
    } finally {
      indexStore.close();
    }
  }

  const sourcePriority: readonly SessionMemoryUnifiedSourceType[] =
    mode === "restore"
      ? ["continuity_event", "indexed_chunk"]
      : ["indexed_chunk", "continuity_event"];
  const results = mergeByPriority(groups, sourcePriority, limit);
  const continuityEventCount = results.filter(
    (result) => result.sourceType === "continuity_event",
  ).length;
  const indexedChunkCount = results.filter(
    (result) => result.sourceType === "indexed_chunk",
  ).length;
  const passed = results.length > 0;
  const summary = passed
    ? `session ${mode} returned ${results.length} result${results.length === 1 ? "" : "s"}`
    : `session ${mode} returned no results`;

  return {
    passed,
    summary,
    counts: {
      resultCount: results.length,
      continuityEventCount,
      indexedChunkCount,
      warningCount: warnings.length,
    },
    results,
    warnings,
    details: { results, warnings },
  };
}

const tool: ToolDescriptor = {
  name: "wp_session_restore",
  description:
    "Restore bounded session continuity context with unified provenance and preview-only results.",
  inputSchema: sessionRecallInputSchema,
  outputSchema: sessionRecallOutputSchema,
  annotations: {
    title: "Session restore",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (raw) => {
    const input = sessionRecallInputSchema.parse(raw ?? {});
    const payload = buildRecallPayload(input, "restore");
    return createSummaryResult(payload, payload.passed ? {} : { isError: true });
  },
};

export default tool;
